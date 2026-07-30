/**
 * Grammar Grok — background service worker
 * API key stays here; never exposed to page scripts.
 */

const API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4.5";
const MAX_CHARS = 8000;
const MAX_ISSUES = 40;
const MAX_FIELD_LEN = 12000;
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
};

/** @type {AbortController | null} */
let activeAbort = null;
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

  if (message.type === "CHECK_TEXT") {
    handleCheck(message)
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

async function handleCheck(message) {
  const raw = typeof message.text === "string" ? message.text : "";
  const trimmed = raw.trim();

  if (trimmed.length < 1) {
    return { ok: false, error: "No text selected." };
  }
  if (trimmed.length > MAX_CHARS) {
    return {
      ok: false,
      error: `Selection is too long (${trimmed.length} chars). Maximum is ${MAX_CHARS}.`,
    };
  }

  const checkMode = message.mode === "style" ? "style" : "grammar";
  const { apiKey, model } = await getSettings();

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

  // Cancel any previous in-flight check (user double-clicked)
  if (activeAbort) {
    try {
      activeAbort.abort();
    } catch {
      /* ignore */
    }
  }
  activeAbort = new AbortController();
  const signal = activeAbort.signal;

  try {
    const content = await callGrok({
      apiKey,
      model,
      system: PROMPTS[checkMode],
      user: trimmed,
      signal,
    });

    const parsed = parseJsonResponse(content, trimmed);
    return {
      ok: true,
      data: {
        ...parsed,
        mode: checkMode,
      },
    };
  } finally {
    if (activeAbort?.signal === signal) activeAbort = null;
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
  maxTokens = 4096,
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

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: sanitizeModel(model),
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw Object.assign(new Error("Request timed out or was cancelled."), {
        name: "AbortError",
      });
    }
    throw new Error("Network error talking to xAI. Check your connection.");
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`xAI API returned non-JSON (HTTP ${res.status}).`);
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

function parseJsonResponse(content, fallbackText) {
  let text = String(content).trim();

  if (text.length > MAX_FIELD_LEN * 2) {
    text = text.slice(0, MAX_FIELD_LEN * 2);
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
    // Do not treat free-form model prose as a safe full replacement
    return {
      language: "und",
      languageName: "Unknown",
      hasChanges: false,
      corrected: fallbackText,
      issues: [],
      summary: "Could not parse structured result. Try again.",
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      language: "und",
      languageName: "Unknown",
      hasChanges: false,
      corrected: fallbackText,
      issues: [],
      summary: "Invalid response shape.",
    };
  }

  const issuesRaw = Array.isArray(data.issues) ? data.issues.slice(0, MAX_ISSUES) : [];
  const issues = issuesRaw.map((i) => ({
    type: clampStr(i?.type || "other", 40),
    original: clampStr(i?.original ?? "", 500),
    suggestion: clampStr(i?.suggestion ?? "", 500),
    explanation: clampStr(i?.explanation ?? "", 500),
  }));

  let corrected =
    typeof data.corrected === "string" && data.corrected.length
      ? data.corrected
      : fallbackText;
  corrected = clampStr(corrected, MAX_FIELD_LEN);

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
