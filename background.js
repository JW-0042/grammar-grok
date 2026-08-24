/**
 * Grammar Grok — background service worker
 * API key stays here; never exposed to page scripts.
 */

const API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4.5";
const MAX_CHARS = 8000;
const MAX_ISSUES = 40;
const MAX_FIELD_LEN = 12000;
const MAX_TRANSLATED_CHARS = 40000;
const MAX_RESPONSE_CHARS = 100000;
const DEFAULT_MAX_TOKENS = 4096;
const TRANSLATE_MAX_TOKENS = 16384;
const FETCH_TIMEOUT_MS = 60000;
const MIN_REQUEST_GAP_MS = 400;

/** Models users may select (blocks arbitrary stored strings). */
const ALLOWED_MODELS = new Set([
  "grok-4.5",
  "grok-4.3",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-0309-reasoning",
]);

const SHARED_JSON_RULES = `
You MUST respond with a single JSON object only (no markdown fences, no commentary).
Schema:
{
  "language": "ISO 639-1 code (e.g. en, cs, sk, de)",
  "languageName": "English name of the language",
  "hasChanges": true/false,
  "corrected": "full corrected text in the same language",
  "issues": [
    {
      "type": "grammar|spelling|punctuation|style|diacritics|other",
      "original": "problematic fragment",
      "suggestion": "fixed fragment",
      "explanation": "short explanation in the language of the text"
    }
  ],
  "summary": "one short sentence summary in the language of the text"
}

Rules:
- Auto-detect the language of the user text. Never translate to another language.
- For Czech and Slovak: fix missing diacritics and use natural local usage.
- Preserve meaning, formatting intent (line breaks), and proper names / brand names.
- If the text is already correct, set hasChanges to false, corrected = original text, issues = [].
- Keep corrected as the complete text ready to replace the selection.
- Keep issues concise; at most ${MAX_ISSUES} items.
`.trim();

const PROMPTS = {
  grammar: `You are an expert proofreader for many languages (especially English, Czech, and Slovak).

Task: GRAMMAR ONLY.
Fix only clear errors: spelling, grammar, morphology, agreement, punctuation, diacritics.
Do NOT rewrite for style, tone, or word choice. Keep the author's voice and sentence structure as much as possible.

${SHARED_JSON_RULES}`,

  style: `You are an expert editor for many languages (especially English, Czech, and Slovak).

Task: GRAMMAR + STYLISTICS.
1) Fix all grammar, spelling, punctuation, and diacritics.
2) Improve clarity, natural flow, tone consistency, and word choice.
Do not change the meaning or invent new facts. Prefer light, natural edits over heavy rewrites.

${SHARED_JSON_RULES}`,

  translate: `You are an expert translator into English.

Task: TRANSLATE TO ENGLISH.
Translate the user text into English. Produce a complete English version of the selection, not a grammar-only rewrite in the source language.

You MUST respond with a single JSON object only (no markdown fences, no commentary).
Schema:
{
  "language": "ISO 639-1 code of the SOURCE language (e.g. en, cs, sk, de)",
  "languageName": "English name of the SOURCE language",
  "hasChanges": true/false,
  "corrected": "full English translation (or original if already English)",
  "issues": [
    {
      "type": "translation|other",
      "original": "source fragment",
      "suggestion": "English fragment",
      "explanation": "short note in English about a nuance, idiom, or choice"
    }
  ],
  "summary": "one short English sentence (e.g. Translated from Slovak.)"
}

Rules:
- Auto-detect the source language.
- Translate the entire user text into natural, fluent English.
- Preserve meaning, tone, formatting intent (line breaks), and proper names / brand names.
- Do not add facts, commentary, titles, or quotes around the translation.
- Keep corrected as the complete English text ready to replace the selection.
- If the text is already English, set hasChanges to false, corrected = original text, issues = [].
- Keep issues concise; at most 40 items. Skip trivial word-for-word notes.
`,
};

/** One active request per tab/frame; checks in other tabs must not cancel each other. */
/** @type {Map<string, AbortController>} */
const activeAborts = new Map();
let lastRequestAt = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ ok: false, error: "Unauthorized." });
    return false;
  }

  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendResponse({ ok: false, error: "Invalid message." });
    return false;
  }

  // Lightweight wake-up for MV3 service worker (content scripts call before checks)
  if (message.type === "PING") {
    sendResponse({ ok: true, pong: true });
    return false;
  }

  if (message.type === "CHECK_TEXT") {
    handleCheck(message, sender)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: safeErrorMessage(err) });
      });
    return true;
  }

  if (message.type === "TEST_KEY") {
    handleTestKey()
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: safeErrorMessage(err) });
      });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown action." });
  return false;
});

/** Only this extension (content scripts + popup). */
function isTrustedSender(sender) {
  return Boolean(sender && sender.id === chrome.runtime.id);
}

function safeErrorMessage(err) {
  let msg = err?.message || String(err) || "Unknown error";
  // Never echo secrets if a buggy path included them
  msg = msg.replace(/xai-[A-Za-z0-9_-]{10,}/gi, "xai-***");
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer ***");
  if (msg.length > 400) msg = msg.slice(0, 400) + "…";
  return msg;
}

function normalizeMode(mode) {
  const m = String(mode || "").trim();
  if (m === "style" || m === "translate") return m;
  return "grammar";
}

function requestScope(sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId === "number") {
    return `tab:${tabId}:frame:${sender?.frameId ?? 0}`;
  }
  return `extension:${String(sender?.url || "unknown")}`;
}

function splitBoundaryWhitespace(raw) {
  const leading = raw.match(/^\s*/)?.[0] || "";
  const rest = raw.slice(leading.length);
  const trailing = rest.match(/\s*$/)?.[0] || "";
  return {
    leading,
    core: rest.slice(0, rest.length - trailing.length),
    trailing,
  };
}

function sanitizeModel(model) {
  const m = String(model || "").trim();
  if (ALLOWED_MODELS.has(m)) return m;
  return DEFAULT_MODEL;
}

function looksLikeApiKey(key) {
  // xAI keys are typically "xai-…"; allow other non-empty keys for flexibility
  if (key.length < 12 || key.length > 512) return false;
  if (/\s/.test(key)) return false;
  return true;
}

async function getSettings() {
  const data = await chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL,
  });
  return {
    apiKey: String(data.apiKey || "").trim(),
    model: sanitizeModel(data.model),
  };
}

async function handleCheck(message, sender) {
  const raw = typeof message.text === "string" ? message.text : "";
  const { leading, core, trailing } = splitBoundaryWhitespace(raw);

  if (core.length < 1) {
    return { ok: false, error: "No text selected." };
  }
  if (raw.length > MAX_CHARS) {
    return {
      ok: false,
      error: `Selection is too long (${raw.length} chars). Maximum is ${MAX_CHARS}.`,
    };
  }

  const checkMode = normalizeMode(message.mode);
  const { apiKey, model: savedModel } = await getSettings();
  // Optional one-shot model override from the result panel (e.g. Retry with Grok 4.5).
  // Only allowlisted ids are accepted; otherwise fall back to the user's saved model.
  const model = sanitizeModel(
    typeof message.model === "string" && message.model.trim()
      ? message.model
      : savedModel
  );

  if (!apiKey) {
    return {
      ok: false,
      error:
        "No API key set. Click the Grammar Grok extension icon and paste your xAI API key from console.x.ai.",
    };
  }
  if (!looksLikeApiKey(apiKey)) {
    return {
      ok: false,
      error: "API key looks invalid. Paste a full key from console.x.ai.",
    };
  }

  const now = Date.now();
  const wait = MIN_REQUEST_GAP_MS - (now - lastRequestAt);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestAt = Date.now();

  const scope = requestScope(sender);
  const previousAbort = activeAborts.get(scope);
  // Cancel only a previous check from the same tab/frame (e.g. a double-click).
  if (previousAbort) {
    try {
      previousAbort.abort();
    } catch {
      /* ignore */
    }
  }
  const activeAbort = new AbortController();
  activeAborts.set(scope, activeAbort);
  const signal = activeAbort.signal;

  try {
    const content = await callGrok({
      apiKey,
      model,
      system: PROMPTS[checkMode],
      user: core,
      maxTokens:
        checkMode === "translate"
          ? TRANSLATE_MAX_TOKENS
          : DEFAULT_MAX_TOKENS,
      jsonMode: true,
      signal,
    });

    const parsed = parseJsonResponse(content, core, checkMode);
    if (parsed.parseError) {
      return { ok: false, error: parsed.parseError };
    }
    return {
      ok: true,
      data: {
        ...parsed,
        corrected: leading + parsed.corrected + trailing,
        mode: checkMode,
        model,
      },
    };
  } finally {
    if (activeAborts.get(scope)?.signal === signal) {
      activeAborts.delete(scope);
    }
  }
}

async function handleTestKey() {
  const { apiKey, model } = await getSettings();
  if (!apiKey) {
    return { ok: false, error: "No API key saved." };
  }
  if (!looksLikeApiKey(apiKey)) {
    return { ok: false, error: "API key looks invalid." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    await callGrok({
      apiKey,
      model,
      system: "Reply with exactly: OK",
      user: "ping",
      maxTokens: 8,
      signal: controller.signal,
    });
    return { ok: true, model };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "Connection timed out." };
    }
    return { ok: false, error: safeErrorMessage(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function callGrok({
  apiKey,
  model,
  system,
  user,
  maxTokens = DEFAULT_MAX_TOKENS,
  jsonMode = false,
  signal,
}) {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      const e = new Error("Request cancelled.");
      e.name = "AbortError";
      throw e;
    }
    signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const requestBody = {
    model: sanitizeModel(model),
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  let res;
  let body;
  try {
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw Object.assign(new Error("Request timed out or was cancelled."), {
          name: "AbortError",
        });
      }
      throw new Error("Network error talking to xAI. Check your connection.");
    }

    try {
      body = await res.json();
    } catch (err) {
      if (err?.name === "AbortError") {
        throw Object.assign(new Error("Request timed out or was cancelled."), {
          name: "AbortError",
        });
      }
      throw new Error(`xAI API returned non-JSON (HTTP ${res.status}).`);
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
  }

  if (!res.ok) {
    const msg =
      body?.error?.message ||
      (typeof body?.error === "string" ? body.error : null) ||
      body?.message ||
      `xAI API error (HTTP ${res.status})`;
    throw new Error(
      typeof msg === "string" ? msg.slice(0, 300) : `xAI API error (HTTP ${res.status})`
    );
  }

  const content = body?.choices?.[0]?.message?.content;
  if (content == null || content === "") {
    throw new Error("Empty response from Grok.");
  }
  return content;
}

function parseJsonResponse(content, fallbackText, mode = "grammar") {
  let text = String(content).trim();

  if (text.length > MAX_RESPONSE_CHARS) {
    return {
      parseError:
        "The model response was too large to process safely. Select a shorter passage and try again.",
    };
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      parseError:
        "Grok returned an incomplete or invalid result. Try again, or select a shorter passage.",
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      parseError: "Grok returned an invalid result shape. Try again.",
    };
  }

  const issuesRaw = Array.isArray(data.issues) ? data.issues.slice(0, MAX_ISSUES) : [];
  const issues = issuesRaw.map((i) => ({
    type: clampStr(i?.type || "other", 40),
    original: clampStr(i?.original ?? "", 500),
    suggestion: clampStr(i?.suggestion ?? "", 500),
    explanation: clampStr(i?.explanation ?? "", 500),
  }));

  if (typeof data.corrected !== "string" || data.corrected.length < 1) {
    return {
      parseError: "Grok returned a result without usable corrected text. Try again.",
    };
  }
  const corrected = data.corrected;
  const correctedLimit =
    mode === "translate" ? MAX_TRANSLATED_CHARS : MAX_FIELD_LEN;
  if (corrected.length > correctedLimit) {
    const resultLabel = mode === "translate" ? "translated" : "corrected";
    return {
      parseError:
        `The ${resultLabel} result is too long to insert safely. Select a shorter passage and try again.`,
    };
  }

  return {
    language: clampStr(data.language || "und", 16),
    languageName: clampStr(data.languageName || "Unknown", 64),
    hasChanges: Boolean(
      data.hasChanges ?? corrected.trim() !== fallbackText.trim()
    ),
    corrected,
    issues,
    summary: clampStr(data.summary || "", 400),
  };
}

function clampStr(v, max) {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
