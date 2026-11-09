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
const STREAM_PORT_NAME = "gg-check-stream";
const PREVIEW_INTERVAL_MS = 120;

/** Models users may select (blocks arbitrary stored strings). */
const ALLOWED_MODELS = new Set([
  "grok-4.7",
  "grok-4.6",
  "grok-4.5",
  "grok-4.3",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-0309-reasoning",
]);

/**
 * These models default to high reasoning and cannot disable it.
 * Low effort keeps a grammar check inside the 60s request timeout.
 */
const LOW_REASONING_MODELS = new Set(["grok-4.5", "grok-4.6", "grok-4.7"]);

/** Plain human writing rules shared by every mode (the text check enforces the mechanical parts). */
const HUMAN_WRITING_RULES = `
- Write naturally in the author's language, the way an ordinary person writes a message or a post. Avoid stereotypical AI wording: stock introductions or conclusions, filler, inflated phrasing, repetitive transitions (Moreover, Furthermore, Additionally), and unnecessary formality.
- Use common everyday, conversational words and simple sentence structure. Never introduce a word, phrase, or construction that is more complex, formal, or bookish than what the original text uses. Words and phrasing the author already used may stay. Do not force slang or replace necessary terminology, proper names, or brand names.
- In the result prose, do not use em dashes (U+2014) or semicolons. Replace existing ones with grammatically appropriate commas, periods, parentheses, or a small sentence adjustment while preserving meaning. Preserve literal code, URLs, and verbatim quotations where changing punctuation would alter their content.
- Do not add characters the original does not use: typographic quotes or apostrophes, the ellipsis character, en dashes, non-breaking or invisible spaces, emoji, arrows, bullets, or Markdown formatting.
`.trim();

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
${HUMAN_WRITING_RULES}
- These wording and punctuation requirements apply to both GRAMMAR ONLY and GRAMMAR + STYLISTICS. In GRAMMAR ONLY, make only the minimal edits needed to meet them and correct errors; otherwise preserve the author's voice and sentence structure.
- If the text already satisfies all correction and wording rules, set hasChanges to false, corrected = original text, issues = [].
- Keep corrected as the complete text ready to replace the selection.
- Keep issues concise; at most ${MAX_ISSUES} items.
`.trim();

const PROMPTS = {
  grammar: `You are an expert proofreader for many languages (especially English, Czech, and Slovak).

Task: GRAMMAR ONLY.
Fix only clear errors: spelling, grammar, morphology, agreement, punctuation, diacritics.
Do NOT otherwise rewrite for style, tone, or word choice beyond the shared wording and punctuation requirements below. Keep the author's voice and sentence structure as much as possible.

${SHARED_JSON_RULES}`,

  style: `You are an expert editor for many languages (especially English, Czech, and Slovak).

Task: GRAMMAR + STYLISTICS.
1) Fix all grammar, spelling, punctuation, and diacritics.
2) Improve clarity, natural flow, tone consistency, and word choice.
Do not change the meaning or invent new facts. Prefer light, natural edits over heavy rewrites. Word-choice changes must make the text simpler and more natural, never fancier.

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
${HUMAN_WRITING_RULES}
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

  // Replace by typing: only content scripts in a tab, and only into that tab.
  if (message.type === "TYPE_TEXT" || message.type === "TYPE_CANCEL") {
    if (typeof sender?.tab?.id !== "number") {
      sendResponse({ ok: false, error: "Unauthorized." });
      return false;
    }
    if (message.type === "TYPE_CANCEL") {
      sendResponse(cancelTyping(sender));
      return false;
    }
    handleTypeText(message, sender)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: safeErrorMessage(err) });
      });
    return true;
  }

  if (message.type === "TEST_KEY") {
    // Only the popup may spend a request on a key test, never a page's content script.
    if (!isExtensionPageSender(sender)) {
      sendResponse({ ok: false, error: "Unauthorized." });
      return false;
    }
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

/**
 * Streaming checks: the content script opens a port, sends one CHECK_TEXT message,
 * receives "preview" / "phase" progress events and finally one "result".
 * Closing the port (panel closed, Escape, new check) aborts the API request.
 */
chrome.runtime.onConnect?.addListener((port) => {
  if (port.name !== STREAM_PORT_NAME) return;
  if (!isTrustedSender(port.sender) || !port.sender?.tab) {
    try {
      port.disconnect();
    } catch {
      /* ignore */
    }
    return;
  }

  const cancel = new AbortController();
  let open = true;
  let started = false;
  const post = (msg) => {
    if (!open) return;
    try {
      port.postMessage(msg);
    } catch {
      open = false;
    }
  };

  port.onDisconnect.addListener(() => {
    open = false;
    cancel.abort();
  });

  port.onMessage.addListener((message) => {
    if (started) return;
    started = true;
    if (!message || typeof message !== "object" || message.type !== "CHECK_TEXT") {
      post({ type: "result", res: { ok: false, error: "Invalid message." } });
      return;
    }
    handleCheck(message, port.sender, { onProgress: post, cancelSignal: cancel.signal })
      .then((res) => post({ type: "result", res }))
      .catch((err) =>
        post({ type: "result", res: { ok: false, error: safeErrorMessage(err) } })
      );
  });
});

// The API key lives in storage.local. Content scripts never read storage, so keep it
// out of their reach where Chrome supports access levels for this area (best effort).
try {
  const pending = chrome.storage?.local?.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  pending?.catch?.(() => {});
} catch {
  /* older Chrome or unsupported storage area */
}

/** Only this extension (content scripts + popup). */
function isTrustedSender(sender) {
  return Boolean(sender && sender.id === chrome.runtime.id);
}

/** Extension pages (popup) only. Content scripts report the page URL, not ours. */
function isExtensionPageSender(sender) {
  if (!isTrustedSender(sender)) return false;
  try {
    return String(sender.url || "").startsWith(chrome.runtime.getURL(""));
  } catch {
    return false;
  }
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

function reasoningEffortFor(model) {
  return LOW_REASONING_MODELS.has(model) ? "low" : null;
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

/**
 * @param {{ onProgress?: (msg: object) => void, cancelSignal?: AbortSignal }} [options]
 *   onProgress enables streaming previews; cancelSignal aborts when the caller goes away.
 */
async function handleCheck(message, sender, { onProgress = null, cancelSignal = null } = {}) {
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
  const onCancel = () => activeAbort.abort();
  if (cancelSignal) {
    if (cancelSignal.aborted) activeAbort.abort();
    else cancelSignal.addEventListener("abort", onCancel, { once: true });
  }

  const maxTokens =
    checkMode === "translate" ? TRANSLATE_MAX_TOKENS : DEFAULT_MAX_TOKENS;
  const system = PROMPTS[checkMode];

  try {
    const content = await callGrok({
      apiKey,
      model,
      system,
      user: core,
      maxTokens,
      jsonMode: true,
      signal,
      onText: onProgress ? makePreviewEmitter(onProgress) : null,
    });

    const parsed = parseJsonResponse(content, core, checkMode);
    if (parsed.parseError) {
      return { ok: false, error: parsed.parseError };
    }

    // Deterministic text check: fix safe character-level AI tells, then ask the model
    // once to repair what cannot be fixed mechanically (em dashes, stock phrases, …).
    let result = parsed;
    let review = reviewText(result.corrected, core, checkMode, result.language);
    const textCheck = { autoFixed: [...review.fixed], repaired: false, remaining: [] };
    result = { ...result, corrected: review.text };

    if (review.problems.length > 0) {
      onProgress?.({ type: "phase", phase: "repair" });
      try {
        const repairedContent = await callGrok({
          apiKey,
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: core },
            { role: "assistant", content: JSON.stringify({ ...parsed, corrected: review.text }) },
            { role: "user", content: buildRepairInstruction(review.problems) },
          ],
          maxTokens,
          jsonMode: true,
          signal,
          onText: onProgress ? makePreviewEmitter(onProgress) : null,
        });
        const repaired = parseJsonResponse(repairedContent, core, checkMode);
        if (!repaired.parseError) {
          const second = reviewText(repaired.corrected, core, checkMode, repaired.language);
          if (second.problems.length <= review.problems.length) {
            result = { ...repaired, corrected: second.text };
            review = second;
            textCheck.repaired = true;
            for (const f of second.fixed) {
              if (!textCheck.autoFixed.includes(f)) textCheck.autoFixed.push(f);
            }
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" && signal.aborted) throw err;
        // Repair is best effort: keep the first result and fall back below.
      }

      const fallback = applyPunctuationFallback(result.corrected, result.language);
      result = { ...result, corrected: fallback.text };
      for (const f of fallback.fixed) {
        if (!textCheck.autoFixed.includes(f)) textCheck.autoFixed.push(f);
      }
      textCheck.remaining = reviewText(result.corrected, core, checkMode, result.language)
        .problems.map((p) => p.label);
    }

    const hasChanges =
      checkMode === "translate"
        ? result.hasChanges
        : result.hasChanges || result.corrected !== core;

    return {
      ok: true,
      data: {
        ...result,
        hasChanges,
        corrected: leading + result.corrected + trailing,
        textCheck,
        mode: checkMode,
        model,
      },
    };
  } finally {
    if (cancelSignal) cancelSignal.removeEventListener("abort", onCancel);
    if (activeAborts.get(scope)?.signal === signal) {
      activeAborts.delete(scope);
    }
  }
}

/** Throttled "preview" events with the partially streamed corrected text. */
function makePreviewEmitter(onProgress) {
  let lastSent = "";
  let lastAt = 0;
  return (content, final = false) => {
    const now = Date.now();
    if (!final && now - lastAt < PREVIEW_INTERVAL_MS) return;
    const text = extractPartialJsonString(content, "corrected");
    if (text == null || text === lastSent) return;
    lastSent = text;
    lastAt = now;
    onProgress({ type: "preview", text: text.slice(0, MAX_TRANSLATED_CHARS) });
  };
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
  messages = null,
  maxTokens = DEFAULT_MAX_TOKENS,
  jsonMode = false,
  signal,
  onText = null,
}) {
  const stream = typeof onText === "function";
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
    messages: Array.isArray(messages)
      ? messages
      : [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
  };
  if (stream) {
    requestBody.stream = true;
  }
  if (jsonMode) {
    requestBody.response_format = { type: "json_object" };
  }
  const reasoningEffort = reasoningEffortFor(requestBody.model);
  if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  let res;
  let body;
  let streamedContent = null;
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

    const contentType = String(res.headers?.get?.("content-type") || "");
    if (stream && res.ok && res.body && /text\/event-stream/i.test(contentType)) {
      try {
        streamedContent = await readStreamedContent(res.body, onText);
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          throw Object.assign(new Error("Request timed out or was cancelled."), {
            name: "AbortError",
          });
        }
        throw err;
      }
    } else {
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
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
  }

  if (streamedContent != null) {
    if (streamedContent === "") throw new Error("Empty response from Grok.");
    onText(streamedContent, true);
    return streamedContent;
  }

  // Streaming is an optimisation: if the API rejects it, retry once without it.
  if (stream && res.status === 400) {
    return callGrok({ apiKey, model, system, user, messages, maxTokens, jsonMode, signal });
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

/* ------------------------------------------------------------------------- */
/* Streaming helpers                                                          */
/* ------------------------------------------------------------------------- */

/** Read an OpenAI-compatible SSE stream and return the concatenated content. */
async function readStreamedContent(body, onText) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  const handleLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, "");
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return true;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return false;
    }
    if (event?.error) {
      const msg = event.error.message || event.error;
      throw new Error(typeof msg === "string" ? msg.slice(0, 300) : "xAI stream error.");
    }
    const piece = event?.choices?.[0]?.delta?.content;
    if (typeof piece === "string" && piece) {
      content += piece;
      if (content.length > MAX_RESPONSE_CHARS) {
        throw new Error(
          "The model response was too large to process safely. Select a shorter passage and try again."
        );
      }
      onText(content);
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (handleLine(line)) return content;
      }
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);
    return content;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* stream already closed */
    }
  }
}

/**
 * Decode the (possibly unfinished) JSON string value of `key` from a partial
 * JSON document, e.g. `{"corrected": "Hello wor` -> `Hello wor`. Returns null
 * until the value has started.
 */
function extractPartialJsonString(json, key) {
  const source = String(json || "");
  const match = new RegExp(`"${key}"\\s*:\\s*"`).exec(source);
  if (!match) return null;
  const ESC = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  let out = "";
  for (let i = match.index + match[0].length; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) return out;
    if (next === "u") {
      const hex = source.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ESC[next] ?? next;
    i += 1;
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Text check: AI-typical characters and wording                              */
/* ------------------------------------------------------------------------- */

/** Code, URLs, e-mail addresses and HTML entities are never touched. */
const PROTECTED_RE =
  /```[\s\S]*?```|`[^`\n]*`|\b(?:https?:\/\/|www\.)[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi;

function splitProtected(text) {
  const source = String(text ?? "");
  const parts = [];
  let last = 0;
  for (const m of source.matchAll(PROTECTED_RE)) {
    if (m.index > last) parts.push({ text: source.slice(last, m.index), protected: false });
    parts.push({ text: m[0], protected: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), protected: false });
  return parts;
}

function mapProse(text, fn) {
  return splitProtected(text)
    .map((p) => (p.protected ? p.text : fn(p.text)))
    .join("");
}

function proseOnly(text) {
  return splitProtected(text)
    .filter((p) => !p.protected)
    .map((p) => p.text)
    .join(" ");
}

/**
 * Characters models add but people rarely type. Each is replaced only when the
 * original text does not use it, so deliberate typography (e.g. Slovak quotes) stays.
 */
const CHAR_FIXES = [
  { label: "invisible characters removed", re: /[​‌‍⁠﻿­]/g, to: "" },
  { label: "non-breaking spaces replaced", re: /[   ]/g, to: " " },
  { label: "typographic quotes replaced", re: /[“”„‟«»]/g, to: '"' },
  { label: "typographic apostrophes replaced", re: /[‘’‚‛]/g, to: "'" },
  { label: "ellipsis character replaced", re: /…/g, to: "..." },
  { label: "en dashes replaced", re: /[‐‑‒–]/g, to: "-" },
  { label: "Markdown bold removed", re: /\*\*(?=\S)([^*\n]+?)\*\*/g, to: "$1" },
];

/** Emoji, arrows, bullets and check marks. */
const SYMBOL_RE = /[\p{Extended_Pictographic}→←↔⇒•▪●✓✔]/gu;

/** Stock AI words and phrases (EN / SK / CS). Flagged only when the original does not use them. */
const AI_PHRASES = [
  // English
  "delv(?:e|es|ed|ing)", "tapestry", "testament to",
  "in today's (?:fast-paced|digital|modern) (?:world|age|landscape)",
  "it(?:'s| is) (?:important|worth|crucial) (?:to note|noting|to remember)",
  "plays? an? (?:crucial|pivotal|vital|key) role", "navigat(?:e|ing) the complexit(?:y|ies)",
  "ever-evolving", "game[- ]changer", "unlock(?:s|ing)? the (?:full )?potential",
  "seamless(?:ly)?", "leverag(?:e|es|ed|ing)", "utili[sz](?:e|es|ed|ing|ation)",
  "facilitat(?:e|es|ed|ing)", "furthermore", "moreover", "additionally", "in conclusion",
  "embark(?:s|ed|ing)? on", "foster(?:s|ed|ing)?", "bolster(?:s|ed|ing)?",
  "underscor(?:e|es|ed|ing)", "showcas(?:e|es|ed|ing)", "multifaceted", "intricate", "pivotal",
  "myriad", "plethora", "meticulous(?:ly)?", "holistic", "synerg(?:y|ies)", "paradigm",
  "cutting-edge", "rest assured", "I hope this (?:email|message) finds you well",
  // Slovak
  "v dnešnej (?:uponáhľanej |digitálnej |modernej )?dobe",
  "je dôležité (?:poznamenať|zdôrazniť|si uvedomiť)", "v neposlednom rade", "v konečnom dôsledku",
  "neoddeliteľn\\p{L}* súčasť\\p{L}*", "zohráva\\p{L}* (?:kľúčovú|zásadnú|dôležitú) úlohu",
  "za účelom", "prostredníctvom", "disponova\\p{L}*", "zrealizova\\p{L}*", "implementova\\p{L}*",
  "optimalizova\\p{L}*", "stojí za zmienku", "ponori\\p{L}* sa", "na (?:vyššiu|novú) úroveň",
  "holistick\\p{L}*", "synergi\\p{L}*", "robustn\\p{L}*", "bezproblémov\\p{L}*",
  // Czech
  "v dnešní (?:uspěchané |digitální |moderní )?době",
  "je důležité (?:poznamenat|zdůraznit|si uvědomit)", "v neposlední řadě", "v konečném důsledku",
  "nedíln\\p{L}* součást\\p{L}*", "hraje\\p{L}* (?:klíčovou|zásadní|důležitou) roli",
  "prostřednictvím", "zrealizova\\p{L}*", "stojí za zmínku", "ponoři\\p{L}* se",
  "na (?:vyšší|novou) úroveň",
].map((p) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${p})(?![\\p{L}\\p{N}])`, "giu"));

function countMatches(re, text) {
  re.lastIndex = 0;
  return (String(text).match(re) || []).length;
}

/**
 * Inspect a model result against the original selection.
 * @returns {{ text: string, fixed: string[], problems: { id: string, label: string, samples: string[] }[] }}
 *   text: result with safe character fixes applied; fixed: labels of those fixes;
 *   problems: issues that need a model repair (or the punctuation fallback).
 */
function reviewText(corrected, original, mode = "grammar", language = "") {
  let text = String(corrected ?? "");
  const source = String(original ?? "");
  const fixed = [];

  for (const rule of CHAR_FIXES) {
    if (countMatches(rule.re, source) > 0) continue;
    const before = text;
    text = mapProse(text, (s) => s.replace(rule.re, rule.to));
    if (text !== before) fixed.push(rule.label);
  }

  const prose = proseOnly(text);
  const sourceProse = proseOnly(source);
  const problems = [];

  const dashes = countMatches(/[—―]/g, prose);
  if (dashes > 0) {
    problems.push({ id: "em-dash", label: `em dashes (${dashes})`, samples: ["—"] });
  }
  // Greek uses ";" as its question mark.
  if (String(language).toLowerCase() !== "el") {
    const semicolons = countMatches(/;/g, prose);
    if (semicolons > 0) {
      problems.push({ id: "semicolon", label: `semicolons (${semicolons})`, samples: [";"] });
    }
  }

  const addedSymbols = [...new Set(prose.match(SYMBOL_RE) || [])].filter(
    (s) => !source.includes(s)
  );
  if (addedSymbols.length > 0) {
    problems.push({
      id: "symbols",
      label: `added symbols (${addedSymbols.join(" ")})`,
      samples: addedSymbols,
    });
  }

  if (mode !== "translate") {
    const phrases = [];
    for (const re of AI_PHRASES) {
      if (countMatches(re, prose) > countMatches(re, sourceProse)) {
        re.lastIndex = 0;
        const sample = (prose.match(re)?.[0] || "").toLowerCase();
        if (sample && !phrases.includes(sample)) phrases.push(sample);
      }
    }
    if (phrases.length > 0) {
      problems.push({
        id: "phrases",
        label: `stock AI wording (${phrases.slice(0, 6).join(", ")})`,
        samples: phrases,
      });
    }
  }

  return { text, fixed, problems };
}

function buildRepairInstruction(problems) {
  const lines = problems.map((p) => {
    if (p.id === "em-dash") {
      return "- It contains em dashes (—). Replace every one with a comma, period, parentheses, or a small sentence change.";
    }
    if (p.id === "semicolon") {
      return "- It contains semicolons. Replace every one with a period or comma, or split the sentence.";
    }
    if (p.id === "symbols") {
      return `- It adds symbols the author did not use (${p.samples.join(" ")}). Remove them.`;
    }
    return `- It adds stock or bookish wording the author did not use: ${p.samples
      .map((s) => `"${s}"`)
      .join(", ")}. Use plain everyday words instead, or keep the author's original wording.`;
  });
  return [
    "Your previous JSON result breaks these output rules:",
    ...lines,
    "Return the complete JSON object again with the same schema. Fix only these problems and keep every other correction. Code, URLs, and verbatim quotations stay unchanged.",
  ].join("\n");
}

/** Last resort when the repair pass still left em dashes or semicolons in prose. */
function applyPunctuationFallback(text, language = "") {
  const input = String(text ?? "");
  const fixed = [];
  let out = mapProse(input, (s) =>
    s
      // Dialogue or list dash at the start of a line.
      .replace(/(^|\n)([ \t]*)[—―][ \t]*/g, "$1$2- ")
      // Dash right after punctuation: drop it.
      .replace(/([,.;:!?])[ \t]*[—―][ \t]*/g, "$1 ")
      // Dash between words or numbers.
      .replace(/[ \t]*[—―][ \t]*/g, ", ")
  );
  if (out !== input) fixed.push("em dashes replaced");

  if (String(language).toLowerCase() !== "el") {
    const before = out;
    out = mapProse(out, (s) =>
      s.replace(/[ \t]*;[ \t]*(\S?)/g, (_m, next) =>
        next ? `. ${next.toLocaleUpperCase()}` : "."
      )
    );
    if (out !== before) fixed.push("semicolons replaced");
  }
  return { text: out, fixed };
}

/* ------------------------------------------------------------------------- */
/* Replace by typing: real key events through chrome.debugger                 */
/* ------------------------------------------------------------------------- */

/** One typing job per tab. @type {Map<number, { cancelled: boolean, detached: boolean }>} */
const activeTyping = new Map();

/**
 * Type `message.text` into the focused element of the sender's tab with real
 * (trusted) key events and human-like timing. The content script has already
 * focused the field and selected the original text, so the first key replaces it.
 * @returns {Promise<{ ok: boolean, disabled?: boolean, cancelled?: boolean, typed?: number, total?: number, error?: string }>}
 */
async function handleTypeText(message, sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { ok: false, error: "Unauthorized." };
  }
  const text = typeof message.text === "string" ? message.text.replace(/\r\n?/g, "\n") : "";
  if (!text) return { ok: false, error: "Nothing to type." };
  if (text.length > MAX_TRANSLATED_CHARS) {
    return { ok: false, error: "The text is too long to type." };
  }

  const { typeLikeHuman } = await chrome.storage.local.get({ typeLikeHuman: true });
  if (typeLikeHuman === false || typeof chrome.debugger?.attach !== "function") {
    return { ok: false, disabled: true };
  }
  if (activeTyping.has(tabId)) {
    return { ok: false, error: "Already typing in this tab." };
  }

  const job = { cancelled: false, detached: false };
  activeTyping.set(tabId, job);
  const target = { tabId };
  const onDetach = (source) => {
    // The user clicked "Cancel" on Chrome's debugging bar, or the tab closed.
    if (source?.tabId === tabId) {
      job.detached = true;
      job.cancelled = true;
    }
  };
  chrome.debugger.onDetach?.addListener(onDetach);

  const chars = Array.from(text);
  let typed = 0;
  try {
    try {
      await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    } catch (err) {
      return {
        ok: false,
        error: `Could not start typing (${safeErrorMessage(err)}). Close DevTools or other debugging extensions, or turn off typing in the popup.`,
      };
    }

    for (let i = 0; i < chars.length; i += 1) {
      if (job.cancelled) break;
      await typeCharacter(target, chars[i]);
      typed += 1;
      if (i < chars.length - 1) await sleep(humanDelay(chars[i], chars[i + 1]));
    }
  } catch (err) {
    if (!job.cancelled) {
      return { ok: false, typed, total: chars.length, error: safeErrorMessage(err) };
    }
  } finally {
    chrome.debugger.onDetach?.removeListener(onDetach);
    activeTyping.delete(tabId);
    if (!job.detached) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        /* already detached */
      }
    }
  }

  if (typed < chars.length) {
    return { ok: false, cancelled: true, typed, total: chars.length };
  }
  return { ok: true, typed, total: chars.length };
}

function cancelTyping(sender) {
  const job = activeTyping.get(sender?.tab?.id);
  if (job) job.cancelled = true;
  return { ok: true, cancelled: Boolean(job) };
}

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const SHIFT_MODIFIER = 8;

/** Key description for Input.dispatchKeyEvent (US-layout codes for ASCII letters/digits). */
function keyEventFor(ch) {
  if (ch === "\n") {
    return { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" };
  }
  if (ch === " ") {
    return { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " ", unmodifiedText: " " };
  }
  if (/^[a-zA-Z]$/.test(ch)) {
    const upper = ch.toUpperCase();
    return {
      key: ch,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      text: ch,
      unmodifiedText: ch.toLowerCase(),
      modifiers: ch === upper ? SHIFT_MODIFIER : 0,
    };
  }
  if (/^[0-9]$/.test(ch)) {
    return { key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: ch.charCodeAt(0), text: ch, unmodifiedText: ch };
  }
  // Diacritics and punctuation: the character itself, as a keyboard layout would produce it.
  return { key: ch, text: ch, unmodifiedText: ch };
}

async function typeCharacter(target, ch) {
  // Emoji and other characters outside the BMP, and tabs (Tab would move focus).
  if (ch.length > 1 || ch === "\t") {
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: ch });
    return;
  }
  const event = keyEventFor(ch);
  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", ...event });
  const { text: _text, unmodifiedText: _unmodified, ...keyUp } = event;
  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...keyUp });
}

/** Pause after `ch` before `next`: a fast typist with small irregular pauses. */
function humanDelay(ch, next) {
  const between = (min, max) => min + Math.random() * (max - min);
  let ms = between(35, 95);
  if (ch === " ") ms += between(10, 70);
  if (/[.!?]/.test(ch) && (next === " " || next === "\n")) ms += between(150, 400);
  else if (/[,;:]/.test(ch)) ms += between(60, 180);
  if (ch === "\n") ms += between(200, 500);
  if (Math.random() < 0.02) ms += between(250, 700);
  return Math.round(ms);
}
