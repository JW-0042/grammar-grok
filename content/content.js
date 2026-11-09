/**
 * Grammar Grok — content script
 * Selection toolbar + result panel (closed Shadow DOM).
 * No API key access; checks go through the background worker.
 */

(() => {
  // Prefer DOM marker over window globals (isolated world, but avoid page fights)
  const HOST_ID = "grammar-grok-host";

  // Some sites (ad iframes, odd blank frames, prototype-patched pages) throw during
  // content-script bootstrap. Fail soft so Chrome does not show a hard extension error.
  try {
    bootstrap();
  } catch (err) {
    try {
      console.debug("[Grammar Grok] content script init skipped:", err);
    } catch {
      /* ignore */
    }
  }

  function bootstrap() {
  if (typeof document === "undefined" || !document) return;
  if (document.getElementById(HOST_ID)) return;
  // Need a real HTML document root; skip XML/SVG-only or not-yet-ready frames.
  if (!(document.documentElement instanceof Element)) return;
  if (typeof document.createElement !== "function") return;

  const MIN_LEN = 3;
  const MAX_SEND_CHARS = 8000;
  const Z = 2147483646;
  const SYNC_MS = 48;
  const MAX_ISSUES_UI = 40;
  const MSG_RETRIES = 4;
  const QUALITY_MODEL = "grok-4.5";
  const STREAM_PORT_NAME = "gg-check-stream";

  const CSS = `
    :host, * { box-sizing: border-box; }
    .gg-toolbar, .gg-panel {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: #f2f2fa;
      position: fixed;
      z-index: 1;
      pointer-events: auto;
    }
    .gg-toolbar[hidden],
    .gg-panel[hidden] {
      display: none !important;
    }
    .gg-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: #16162a;
      border: 1px solid #3a3a5c;
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.45), 0 0 0 1px rgba(124,106,247,.15);
      user-select: none;
    }
    .gg-toolbar.gg-loading { opacity: .75; }
    .gg-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: transparent;
      color: #f2f2fa;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      white-space: nowrap;
    }
    .gg-btn:hover:not(:disabled) { background: #2a2a48; }
    .gg-btn:disabled { opacity: .6; cursor: wait; }
    .gg-ico { font-size: 14px; opacity: .95; }
    .gg-sep {
      width: 1px;
      height: 22px;
      background: #3a3a5c;
      margin: 0 2px;
    }
    .gg-panel {
      max-height: min(70vh, 560px);
      display: flex;
      flex-direction: column;
      background: #141428;
      border: 1px solid #3a3a5c;
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0,0,0,.55);
      overflow: hidden;
      top: 72px;
      right: 16px;
      width: min(420px, calc(100vw - 24px));
    }
    .gg-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid #2e2e4a;
      background: #1a1a32;
      flex-shrink: 0;
    }
    .gg-head-left {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .gg-title { font-weight: 700; font-size: 14px; }
    .gg-err-title { color: #ff7a96; }
    .gg-badge {
      font-size: 11px;
      font-weight: 650;
      padding: 2px 8px;
      border-radius: 999px;
      background: #3d2f8c;
      color: #e8e4ff;
    }
    .gg-badge-muted { background: #2a2a48; color: #b8b8d0; }
    .gg-close {
      border: none;
      background: transparent;
      color: #a0a0bc;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
      border-radius: 6px;
    }
    .gg-close:hover { background: #2a2a48; color: #fff; }
    .gg-body {
      padding: 12px 14px;
      overflow: auto;
      flex: 1;
      min-height: 0;
      scrollbar-width: thin;
      scrollbar-color: #5a5a80 transparent;
    }
    .gg-body::-webkit-scrollbar {
      width: 10px;
    }
    .gg-body::-webkit-scrollbar-track {
      background: transparent;
      margin: 4px 0;
    }
    .gg-body::-webkit-scrollbar-thumb {
      background: #3f3f63;
      border-radius: 999px;
      border: 2px solid #141428;
    }
    .gg-body::-webkit-scrollbar-thumb:hover {
      background: #5a5a80;
    }
    .gg-summary { margin: 0 0 10px; color: #c8c8e0; font-size: 12px; }
    .gg-label {
      display: block;
      font-size: 11px;
      font-weight: 650;
      color: #9a9ab8;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 6px;
    }
    .gg-corrected {
      display: block;
      width: 100%;
      min-height: 0;
      height: auto;
      resize: none;
      overflow: hidden;
      field-sizing: content;
      background: #0e0e1c;
      border: 1px solid #343454;
      border-radius: 8px;
      color: #f2f2fa;
      padding: 10px;
      font: inherit;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .gg-corrected:focus { outline: 2px solid rgba(124,106,247,.45); border-color: #7c6af7; }
    .gg-issues {
      list-style: none;
      margin: 12px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .gg-issues li {
      background: #1a1a30;
      border: 1px solid #2e2e4a;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .gg-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
      background: #2d3d28;
      color: #9de0a8;
      padding: 1px 6px;
      border-radius: 4px;
      margin-right: 6px;
    }
    .gg-from { color: #ff9aab; text-decoration: line-through; opacity: .9; }
    .gg-arrow { color: #6a6a88; margin: 0 4px; }
    .gg-to { color: #8dffb0; }
    .gg-expl { margin-top: 4px; color: #a8a8c4; }
    .gg-muted { color: #9a9ab8; margin: 8px 0 0; }
    .gg-muted.center { text-align: center; }
    .gg-error { color: #ff9aab; margin: 0; white-space: pre-wrap; }
    .gg-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid #2e2e4a;
      background: #1a1a32;
      flex-shrink: 0;
    }
    .gg-action {
      border: 1px solid #3a3a5c;
      background: transparent;
      color: #f2f2fa;
      border-radius: 8px;
      padding: 8px 12px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .gg-action:hover { border-color: #7c6af7; }
    .gg-primary {
      background: #6d5cf0;
      border-color: #6d5cf0;
      color: #fff;
    }
    .gg-primary:hover { background: #7f6fff; border-color: #7f6fff; }
    .gg-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #3a3a5c;
      border-top-color: #7c6af7;
      border-radius: 50%;
      animation: gg-spin .7s linear infinite;
      margin: 8px auto;
    }
    @keyframes gg-spin { to { transform: rotate(360deg); } }
    .gg-toast {
      position: absolute;
      bottom: 56px;
      left: 50%;
      transform: translateX(-50%);
      background: #22223a;
      border: 1px solid #4a4a6c;
      color: #e8e8ff;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0,0,0,.35);
    }
    .gg-toast-err { border-color: #8a3048; color: #ffb0c0; }
    .gg-preview { opacity: .7; margin-top: 10px; }
    .gg-spinner.gg-spinner-sm { width: 16px; height: 16px; border-width: 2px; margin: 0; flex-shrink: 0; }
    .gg-status-line { display: flex; align-items: center; gap: 8px; }
    .gg-status-line .gg-muted { margin: 0; }
    .gg-check { margin: 10px 0 0; font-size: 12px; color: #9de0a8; }
    .gg-check-warn { color: #ffcf7a; }
  `;

  /** @type {{ text: string, range: Range | null, editable: HTMLElement | null, start: number | null, end: number | null }} */
  let selectionState = emptySelection();
  let loading = false;
  let debounceTimer = null;
  let toastTimer = null;
  /** @type {string | null} */
  let correctedCache = null;
  let checkSeq = 0;
  /** Last successful/attempted check params so Redo / quality boost can re-run. */
  /** @type {{ mode: "grammar" | "style" | "translate", text: string } | null} */
  let lastCheckRequest = null;
  /** Streaming port of the running check; disconnecting it aborts the API request. */
  /** @type {{ port: chrome.runtime.Port, cancel: () => void } | null} */
  let activePort = null;
  /** True while the background types the correction with real key events. */
  let typing = false;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-grammar-grok", "1");
  try {
    host.setAttribute(
      "data-grammar-grok-version",
      chrome.runtime.getManifest().version
    );
  } catch {
    /* diagnostic marker is optional */
  }
  applyHostShellStyles(host, Z);

  let shadow;
  try {
    if (typeof host.attachShadow !== "function") return;
    shadow = host.attachShadow({ mode: "closed" });
  } catch (err) {
    // Closed shadow roots can be blocked or prototype-patched on some frames.
    try {
      console.debug("[Grammar Grok] attachShadow failed:", err);
    } catch {
      /* ignore */
    }
    return;
  }
  if (!shadow) return;

  const style = document.createElement("style");
  injectStyleText(style, CSS);
  shadow.appendChild(style);

  const toolbar = document.createElement("div");
  toolbar.className = "gg-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Grammar Grok");
  // Build without innerHTML for static chrome (slightly safer / clearer)
  const btnGrammar = makeModeButton("grammar", "✓", "Grammar", "Fix grammar, spelling, punctuation");
  const sep = document.createElement("span");
  sep.className = "gg-sep";
  sep.setAttribute("aria-hidden", "true");
  const btnStyle = makeModeButton("style", "✎", "Grammar + Style", "Grammar + style / clarity");
  const sep2 = document.createElement("span");
  sep2.className = "gg-sep";
  sep2.setAttribute("aria-hidden", "true");
  const btnTranslate = makeModeButton("translate", "EN", "Translate to EN", "Translate selection to English");
  toolbar.append(btnGrammar, sep, btnStyle, sep2, btnTranslate);
  shadow.appendChild(toolbar);

  const toolbarButtons = [btnGrammar, btnStyle, btnTranslate];

  const panel = document.createElement("div");
  panel.className = "gg-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Grammar Grok result");
  shadow.appendChild(panel);

  function applyHostShellStyles(el, zIndex) {
    const css =
      "all:initial;position:fixed;inset:0;pointer-events:none;z-index:" +
      String(zIndex) +
      ";";
    // Prefer discrete properties over cssText — some pages throw on style.cssText
    // assignment (prototype patches / frozen style objects / odd iframe docs).
    try {
      el.style.setProperty("all", "initial");
      el.style.setProperty("position", "fixed");
      el.style.setProperty("inset", "0");
      el.style.setProperty("pointer-events", "none");
      el.style.setProperty("z-index", String(zIndex));
      return;
    } catch {
      /* fall through */
    }
    try {
      el.setAttribute("style", css);
      return;
    } catch {
      /* fall through */
    }
    try {
      el.style.cssText = css;
    } catch {
      /* last resort already failed — continue without shell styles */
    }
  }

  function injectStyleText(styleEl, cssText) {
    try {
      styleEl.textContent = cssText;
      return;
    } catch {
      /* Trusted Types / patched textContent */
    }
    try {
      styleEl.appendChild(document.createTextNode(cssText));
    } catch {
      /* UI chrome CSS unavailable in this frame */
    }
  }

  function normalizeMode(mode) {
    const m = String(mode || "").trim();
    if (m === "style" || m === "translate") return m;
    return "grammar";
  }

  function modeLabel(mode) {
    if (mode === "style") return "Grammar + Style";
    if (mode === "translate") return "Translate to EN";
    return "Grammar";
  }

  function makeModeButton(mode, ico, label, title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gg-btn";
    btn.dataset.mode = mode;
    btn.title = title;
    const s = document.createElement("span");
    s.className = "gg-ico";
    s.textContent = ico;
    s.setAttribute("aria-hidden", "true");
    const t = document.createElement("span");
    t.textContent = label;
    btn.append(s, t);
    return btn;
  }

  function emptySelection() {
    return { text: "", range: null, editable: null, start: null, end: null };
  }

  function mountHost() {
    const root = document.documentElement;
    if (!(root instanceof Element)) return false;
    try {
      if (!root.contains(host)) {
        root.appendChild(host);
      }
      return true;
    } catch (err) {
      try {
        console.debug("[Grammar Grok] mountHost failed:", err);
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  if (!mountHost()) return;

  function isTextField(el) {
    return (
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement &&
        // Never read password fields: their value must not leave the page.
        /^(text|search|email|url|tel|number|)$/i.test(el.type || "text"))
    );
  }

  function isWritableTextField(el) {
    return (
      isTextField(el) &&
      !el.disabled &&
      !el.readOnly
    );
  }

  function isWritableRichEditable(el) {
    return Boolean(
      el instanceof HTMLElement &&
        (el.isContentEditable || el.getAttribute("role") === "textbox") &&
        el.getAttribute("aria-readonly") !== "true" &&
        el.getAttribute("aria-disabled") !== "true"
    );
  }

  function isWritableEditable(el) {
    return isWritableTextField(el) || isWritableRichEditable(el);
  }

  function findEditable(node) {
    if (!node) return null;
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!(el instanceof Element)) return null;
    // contenteditable (X/Twitter compose, many editors) + role=textbox
    const hit = el.closest?.(
      '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]'
    );
    if (hit instanceof HTMLElement) {
      if (hit.isContentEditable || hit.getAttribute("role") === "textbox") {
        return hit;
      }
    }
    if (el instanceof HTMLElement && el.isContentEditable) return el;
    return null;
  }

  function captureSelection() {
    const active = document.activeElement;

    if (active && isTextField(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (typeof start === "number" && typeof end === "number" && end > start) {
        const text = active.value.slice(start, end);
        if (text.trim().length >= MIN_LEN) {
          return { text, range: null, editable: active, start, end };
        }
      }
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

    const text = sel.toString();
    if (text.trim().length < MIN_LEN) return null;

    let range = null;
    try {
      range = sel.getRangeAt(0).cloneRange();
    } catch {
      range = null;
    }

    // Prefer editable under selection; fall back to focused contenteditable (X compose)
    let editable =
      findEditable(sel.anchorNode) ||
      findEditable(sel.focusNode) ||
      (active instanceof HTMLElement ? findEditable(active) : null) ||
      (active instanceof HTMLElement && active.isContentEditable ? active : null);

    return { text, range, editable, start: null, end: null };
  }

  /** True while this content script is still tied to a live extension instance. */
  function isRuntimeAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidError(err) {
    const msg = String(err?.message || err || "");
    return (
      err?.code === "CONTEXT_INVALIDATED" ||
      /extension context invalidated/i.test(msg) ||
      /context invalidated/i.test(msg)
    );
  }

  function isNoReceiverError(err) {
    const msg = String(err?.message || err || "");
    return /receiving end does not exist|could not establish connection/i.test(msg);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Reliable messaging for MV3: wake SW with retries; surface invalidated context clearly.
   * Common after extension reload while X/Twitter tab stayed open, or SW cold start.
   */
  async function sendToBackground(message) {
    if (!isRuntimeAlive()) {
      const e = new Error(
        "Extension was reloaded or updated. Refresh this page (F5) and try again."
      );
      e.code = "CONTEXT_INVALIDATED";
      throw e;
    }

    let lastErr = null;
    for (let attempt = 0; attempt < MSG_RETRIES; attempt++) {
      if (!isRuntimeAlive()) {
        const e = new Error(
          "Extension was reloaded or updated. Refresh this page (F5) and try again."
        );
        e.code = "CONTEXT_INVALIDATED";
        throw e;
      }
      try {
        const res = await chrome.runtime.sendMessage(message);
        // Undefined can mean SW did not respond yet
        if (res === undefined && attempt < MSG_RETRIES - 1) {
          await sleep(80 * (attempt + 1));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (isContextInvalidError(err)) {
          const e = new Error(
            "Extension was reloaded or updated. Refresh this page (F5) and try again."
          );
          e.code = "CONTEXT_INVALIDATED";
          throw e;
        }
        if (isNoReceiverError(err) && attempt < MSG_RETRIES - 1) {
          await sleep(100 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error("No response from extension background.");
  }

  function pingBackground() {
    if (!isRuntimeAlive()) return;
    chrome.runtime.sendMessage({ type: "PING" }).catch(() => {
      /* SW may be sleeping; CHECK_TEXT will retry */
    });
  }

  function hideToolbar() {
    toolbar.hidden = true;
    toolbar.style.display = "none";
    toolbar.style.pointerEvents = "none";
  }

  function revealToolbar() {
    toolbar.hidden = false;
    toolbar.style.display = "flex";
    toolbar.style.pointerEvents = "auto";
  }

  function cancelActivePort() {
    const active = activePort;
    activePort = null;
    if (!active) return;
    // disconnect() does not fire onDisconnect on this side, so settle the promise here.
    active.cancel();
    try {
      active.port.disconnect();
    } catch {
      /* already closed */
    }
  }

  function hidePanel() {
    if (loading) {
      // Closing the panel abandons the running check (and its API request).
      checkSeq += 1;
      loading = false;
      setToolbarLoading(false);
    }
    cancelActivePort();
    panel.hidden = true;
    panel.style.display = "none";
    panel.style.pointerEvents = "none";
    // Clear nodes without leaving large strings in memory longer than needed
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    correctedCache = null;
  }

  function revealPanel() {
    panel.hidden = false;
    panel.style.display = "flex";
    panel.style.pointerEvents = "auto";
  }

  function showToolbar() {
    if (loading || typing) return;
    if (!isRuntimeAlive()) {
      hideToolbar();
      return;
    }
    const cap = captureSelection();
    if (!cap) {
      hideToolbar();
      return;
    }
    selectionState = cap;
    mountHost();
    revealToolbar();
    // Wake MV3 service worker early so the check is less likely to race a cold start
    pingBackground();
  }

  function syncToolbarToSelection() {
    if (loading) return;
    // Only needed while visible (hide when selection gone)
    if (toolbar.hidden) return;
    if (!captureSelection()) {
      hideToolbar();
    }
  }

  function debounce(fn, ms) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  }

  hideToolbar();
  hidePanel();

  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    if (isEventInHost(e)) return;
    debounce(showToolbar, 10);
  });

  /** Keyboard gestures that create/extend a text selection (incl. Ctrl/Cmd+A). */
  function isSelectionGestureKey(e) {
    if (!e) return false;
    const key = String(e.key || "");
    const code = String(e.code || "");
    if (
      key === "Shift" ||
      key.startsWith("Arrow") ||
      key === "End" ||
      key === "Home" ||
      key === "PageUp" ||
      key === "PageDown"
    ) {
      return true;
    }
    // Select-all: Ctrl+A (Windows/Linux) or Cmd+A (macOS)
    const selectAllKey =
      key.toLowerCase() === "a" || code === "KeyA";
    if (selectAllKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
      return true;
    }
    return false;
  }

  function scheduleToolbarFromKeyboard() {
    // Browser applies the new selection after the key event in many editors.
    // Check twice: microtask-ish (0ms) and a short follow-up for slower fields.
    setTimeout(() => {
      if (!loading) showToolbar();
    }, 0);
    setTimeout(() => {
      if (!loading) showToolbar();
    }, 30);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (isEventInHost(e)) return;
      if (isSelectionGestureKey(e) && ((e.ctrlKey || e.metaKey) || e.shiftKey || e.key.startsWith("Arrow") || e.key === "End" || e.key === "Home" || e.key === "PageUp" || e.key === "PageDown")) {
        // Especially important for Ctrl/Cmd+A: selection often exists before keyup.
        if ((e.ctrlKey || e.metaKey) && (String(e.key || "").toLowerCase() === "a" || e.code === "KeyA")) {
          scheduleToolbarFromKeyboard();
        }
      }
    },
    true
  );

  document.addEventListener(
    "keyup",
    (e) => {
      if (isEventInHost(e)) return;
      if (isSelectionGestureKey(e)) {
        // Ctrl/Cmd+A and Shift/Arrow selections should open the toolbar, not only mouse drags.
        if ((e.ctrlKey || e.metaKey) && (String(e.key || "").toLowerCase() === "a" || e.code === "KeyA")) {
          scheduleToolbarFromKeyboard();
        } else {
          debounce(showToolbar, 10);
        }
      }
    },
    true
  );

  // Cheap path: only while toolbar is open
  document.addEventListener("selectionchange", () => {
    if (loading || toolbar.hidden) return;
    debounce(syncToolbarToSelection, SYNC_MS);
  });

  document.addEventListener(
    "mousedown",
    (e) => {
      if (typing && e.isTrusted) stopTyping();
      if (isEventInHost(e)) return;
      if (!toolbar.hidden && !loading) hideToolbar();
    },
    true
  );

  document.addEventListener(
    "select",
    (e) => {
      if (isEventInHost(e)) return;
      debounce(showToolbar, 10);
    },
    true
  );

  document.addEventListener(
    "blur",
    (e) => {
      if (isEventInHost(e)) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        setTimeout(() => {
          if (!loading && !captureSelection()) hideToolbar();
        }, 0);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        if (typing) {
          // Keep Escape away from the page (X would close the reply composer).
          e.preventDefault();
          e.stopPropagation();
          stopTyping();
          return;
        }
        hideToolbar();
        hidePanel();
      }
    },
    true
  );

  function isEventInHost(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    return path.includes(host) || path.includes(toolbar) || path.includes(panel);
  }

  toolbar.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  toolbar.addEventListener("click", (e) => {
    // Page scripts must not be able to trigger paid API requests.
    if (!e.isTrusted) return;
    const btn = e.target.closest?.("[data-mode]");
    if (!btn || loading) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = normalizeMode(btn.getAttribute("data-mode"));
    const text = selectionState.text || captureSelection()?.text || "";
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN) return;
    if (text.length > MAX_SEND_CHARS) {
      showErrorPanel(
        `Selection is too long (${text.length} chars). Maximum is ${MAX_SEND_CHARS}.`
      );
      return;
    }
    runCheck(mode, text);
  });

  /**
   * @param {"grammar"|"style"|"translate"} mode
   * @param {string} text
   * @param {{ model?: string, loadingHint?: string } | undefined} options
   */
  async function runCheck(mode, text, options = {}) {
    const seq = ++checkSeq;
    loading = true;
    setToolbarLoading(true);
    lastCheckRequest = { mode, text };
    const modelOverride =
      typeof options.model === "string" && options.model.trim()
        ? options.model.trim()
        : null;
    showLoadingPanel(mode, {
      modelLabel: modelOverride || options.loadingHint || null,
    });

    try {
      // Warm-up then check (helps after idle tabs / X SPA compose modals)
      try {
        await sendToBackground({ type: "PING" });
      } catch (err) {
        if (isContextInvalidError(err)) throw err;
        // ignore soft ping failures; CHECK_TEXT still retries
      }

      /** @type {{ type: string, mode: string, text: string, model?: string }} */
      const payload = {
        type: "CHECK_TEXT",
        mode,
        text,
      };
      if (modelOverride) payload.model = modelOverride;

      const res = await checkWithPreview(payload, seq);
      // Ignore stale responses if user started another check
      if (seq !== checkSeq) return;

      if (!res || typeof res !== "object") {
        showErrorPanel("No response from extension. Try again, or refresh the page.");
      } else if (!res.ok) {
        showErrorPanel(String(res.error || "Unknown error."), {
          allowReload: /api key|invalid/i.test(String(res.error || "")),
        });
      } else if (!res.data || typeof res.data !== "object") {
        showErrorPanel("Invalid response data.");
      } else {
        showResultPanel(res.data);
      }
    } catch (err) {
      if (seq !== checkSeq) return;
      if (isContextInvalidError(err)) {
        showErrorPanel(
          "Extension connection lost (often after reloading the extension, or a long-lived X/Twitter tab). Refresh this page, then select your text again.",
          { allowReload: true }
        );
      } else {
        showErrorPanel(err?.message || String(err), {
          allowReload: isNoReceiverError(err),
        });
      }
    } finally {
      if (seq === checkSeq) {
        loading = false;
        setToolbarLoading(false);
        hideToolbar();
      }
    }
  }

  /**
   * Streaming check over a port (live preview in the panel). Falls back to the
   * one-shot message if the port fails before any progress arrived.
   */
  async function checkWithPreview(payload, seq) {
    let progressed = false;
    try {
      return await checkViaPort(payload, (msg) => {
        if (seq !== checkSeq) return;
        progressed = true;
        if (msg.type === "preview") {
          updateLoadingPreview(msg.text);
        } else if (msg.type === "phase" && msg.phase === "repair") {
          setLoadingStatus("Removing AI-style wording and punctuation\u2026");
        }
      });
    } catch (err) {
      if (seq !== checkSeq || isContextInvalidError(err)) throw err;
      if (progressed || err?.code !== "PORT_CLOSED") throw err;
      return sendToBackground(payload);
    }
  }

  function checkViaPort(payload, onEvent) {
    return new Promise((resolve, reject) => {
      const fail = (err) => {
        const e = new Error(String(err?.message || err || "Connection closed."));
        e.code = isContextInvalidError(err) ? "CONTEXT_INVALIDATED" : "PORT_CLOSED";
        reject(e);
      };
      if (!isRuntimeAlive()) {
        fail(new Error("Extension context invalidated."));
        return;
      }
      cancelActivePort();
      let port;
      try {
        port = chrome.runtime.connect({ name: STREAM_PORT_NAME });
      } catch (err) {
        fail(err);
        return;
      }
      let settled = false;
      const active = {
        port,
        cancel: () => {
          if (settled) return;
          release();
          fail(new Error("Check cancelled."));
        },
      };
      activePort = active;
      const release = () => {
        settled = true;
        if (activePort === active) activePort = null;
      };

      port.onMessage.addListener((msg) => {
        if (settled || !msg || typeof msg !== "object") return;
        if (msg.type === "result") {
          release();
          try {
            port.disconnect();
          } catch {
            /* ignore */
          }
          resolve(msg.res);
          return;
        }
        onEvent(msg);
      });

      port.onDisconnect.addListener(() => {
        let reason = "";
        try {
          reason = chrome.runtime.lastError?.message || "";
        } catch {
          /* context gone */
        }
        if (settled) return;
        release();
        fail(new Error(reason || "Connection to the extension background closed."));
      });

      try {
        port.postMessage(payload);
      } catch (err) {
        if (settled) return;
        release();
        fail(err);
      }
    });
  }

  function setToolbarLoading(on) {
    toolbar.classList.toggle("gg-loading", on);
    for (const b of toolbarButtons) b.disabled = on;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function makeCloseBtn() {
    const b = el("button", "gg-close");
    b.type = "button";
    b.dataset.action = "close";
    b.setAttribute("aria-label", "Close");
    b.textContent = "×";
    return b;
  }

  function showLoadingPanel(mode, { modelLabel = null } = {}) {
    mountHost();
    clearPanel();
    revealPanel();
    const label = modeLabel(mode);
    const head = el("div", "gg-panel-head");
    head.append(el("span", "gg-title", "Checking…"), makeCloseBtn());
    const body = el("div", "gg-body");
    const bits = [label, "language auto-detect"];
    if (modelLabel) bits.push(String(modelLabel));
    body.append(el("div", "gg-spinner"), el("p", "gg-muted center", bits.join(" · ")));
    panel.append(head, body);
  }

  /** Swap the big spinner for a live, read-only preview of the streamed result. */
  function updateLoadingPreview(text) {
    const body = panel.querySelector(".gg-body");
    if (!body) return;
    let preview = body.querySelector(".gg-preview");
    if (!preview) {
      const status = el("div", "gg-status-line");
      status.append(el("div", "gg-spinner gg-spinner-sm"), el("p", "gg-muted", "Writing\u2026"));
      preview = document.createElement("textarea");
      preview.className = "gg-corrected gg-preview";
      preview.readOnly = true;
      preview.rows = 1;
      preview.setAttribute("aria-label", "Result preview");
      preview.setAttribute("aria-busy", "true");
      while (body.firstChild) body.removeChild(body.firstChild);
      body.append(status, preview);
    }
    preview.value = String(text ?? "");
    preview.style.height = "auto";
    preview.style.height = `${Math.max(preview.scrollHeight, 1)}px`;
  }

  function setLoadingStatus(message) {
    const status =
      panel.querySelector(".gg-status-line .gg-muted") ||
      panel.querySelector(".gg-body > .gg-muted");
    if (status) status.textContent = message;
  }

  function showErrorPanel(message, { allowReload = false } = {}) {
    mountHost();
    clearPanel();
    revealPanel();
    correctedCache = null;
    const head = el("div", "gg-panel-head");
    head.append(el("span", "gg-title gg-err-title", "Error"), makeCloseBtn());
    const body = el("div", "gg-body");
    body.append(el("p", "gg-error", String(message || "Error")));
    const foot = el("div", "gg-footer");
    if (allowReload) {
      const reload = el("button", "gg-action gg-primary", "Refresh page");
      reload.type = "button";
      reload.dataset.action = "reload";
      foot.append(reload);
    }
    const close = el("button", "gg-action", "Close");
    close.type = "button";
    close.dataset.action = "close";
    foot.append(close);
    panel.append(head, body, foot);
  }

  function showResultPanel(data) {
    mountHost();
    clearPanel();
    revealPanel();

    const usedMode = normalizeMode(data.mode);
    const modeBadge = modeLabel(usedMode);
    const lang = String(data.languageName || data.language || "Unknown").slice(0, 64);
    const modelUsed = String(data.model || "").trim();
    const sourceLanguage = String(data.language || "").trim().toLowerCase();
    const issues = Array.isArray(data.issues)
      ? data.issues.slice(0, MAX_ISSUES_UI)
      : [];
    const canReplace = isWritableEditable(selectionState.editable);
    const canRerun = Boolean(lastCheckRequest?.text);
    const corrected = String(data.corrected ?? "");
    correctedCache = corrected;

    const head = el("div", "gg-panel-head");
    const left = el("div", "gg-head-left");
    left.append(
      el(
        "span",
        "gg-title",
        usedMode === "translate"
          ? !data.hasChanges && sourceLanguage === "en"
            ? "Already English"
            : "Translation"
          : data.hasChanges
            ? "Suggestions"
            : "Looks good"
      ),
      el("span", "gg-badge", lang),
      el("span", "gg-badge gg-badge-muted", modeBadge)
    );
    if (modelUsed) {
      left.append(el("span", "gg-badge gg-badge-muted", modelUsed));
    }
    head.append(left, makeCloseBtn());

    const body = el("div", "gg-body");
    if (data.summary) {
      body.append(el("p", "gg-summary", String(data.summary).slice(0, 400)));
    }
    body.append(el("label", "gg-label", usedMode === "translate" ? "English translation" : "Corrected text"));
    const ta = document.createElement("textarea");
    ta.className = "gg-corrected";
    ta.readOnly = true;
    ta.rows = 1;
    ta.setAttribute(
      "aria-label",
      usedMode === "translate" ? "English translation" : "Corrected text"
    );
    ta.value = corrected;
    // Grow with content so only the panel body scrolls (no nested textarea scrollbar).
    const fitCorrected = () => {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(ta.scrollHeight, 1)}px`;
    };
    body.append(ta);
    fitCorrected();
    appendTextCheck(body, data.textCheck);
    // Second pass after layout (fonts/wrap) to avoid a short clipped first paint.
    requestAnimationFrame(fitCorrected);

    if (issues.length > 0) {
      const ul = el("ul", "gg-issues");
      for (const i of issues) {
        const li = document.createElement("li");
        li.append(el("span", "gg-tag", String(i.type || "other").slice(0, 40)));
        if (i.original) {
          li.append(
            el("span", "gg-from", String(i.original).slice(0, 500)),
            el("span", "gg-arrow", "→"),
            el("span", "gg-to", String(i.suggestion || "").slice(0, 500))
          );
        }
        if (i.explanation) {
          li.append(el("div", "gg-expl", String(i.explanation).slice(0, 500)));
        }
        ul.append(li);
      }
      body.append(ul);
    } else if (data.hasChanges) {
      body.append(el("p", "gg-muted", "No detailed issues listed."));
    }

    const foot = el("div", "gg-footer");
    const copyBtn = el("button", "gg-action gg-primary", "Copy");
    copyBtn.type = "button";
    copyBtn.dataset.action = "copy";
    foot.append(copyBtn);
    if (canReplace) {
      const rep = el("button", "gg-action", "Replace");
      rep.type = "button";
      rep.dataset.action = "replace";
      rep.title = "Replace the selection with the result in one step";
      const typeRep = el("button", "gg-action", "Replace by typing");
      typeRep.type = "button";
      typeRep.dataset.action = "replace-typing";
      typeRep.title =
        "Type the result over your selection key by key, like a person. Click the page or press Escape to stop.";
      foot.append(rep, typeRep);
    }
    if (canRerun) {
      const redo = el("button", "gg-action", "Redo");
      redo.type = "button";
      redo.dataset.action = "redo";
      redo.title = "Run the same check again with your saved model";
      foot.append(redo);

      // One-shot quality boost when the fast default model is not good enough.
      if (modelUsed !== QUALITY_MODEL) {
        const quality = el("button", "gg-action", "Grok 4.5");
        quality.type = "button";
        quality.dataset.action = "redo-quality";
        quality.title = "One-time recheck with Grok 4.5 (does not change your saved model)";
        foot.append(quality);
      }
    }
    const close = el("button", "gg-action", "Close");
    close.type = "button";
    close.dataset.action = "close";
    foot.append(close);

    const toast = el("div", "gg-toast");
    toast.hidden = true;

    panel.append(head, body, foot, toast);
  }

  /** Short note about the automatic AI-text check (textContent only). */
  function appendTextCheck(body, check) {
    if (!check || typeof check !== "object") return;
    const fixed = Array.isArray(check.autoFixed)
      ? check.autoFixed.slice(0, 8).map((s) => String(s).slice(0, 80))
      : [];
    const remaining = Array.isArray(check.remaining)
      ? check.remaining.slice(0, 6).map((s) => String(s).slice(0, 120))
      : [];
    const done = [];
    if (check.repaired) done.push("AI-style wording reworked");
    done.push(...fixed);
    if (done.length > 0) {
      body.append(el("p", "gg-check", `Text check: ${done.join(", ")}.`));
    }
    if (remaining.length > 0) {
      body.append(el("p", "gg-check gg-check-warn", `Please review: ${remaining.join(", ")}.`));
    }
  }

  function clearPanel() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
  }

  panel.addEventListener("click", async (e) => {
    if (!e.isTrusted) return;
    const btn = e.target.closest?.("[data-action]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = btn.getAttribute("data-action");
    const corrected =
      correctedCache ??
      panel.querySelector(".gg-corrected")?.value ??
      "";

    if (action === "close") {
      hidePanel();
      return;
    }

    if (action === "reload") {
      try {
        window.location.reload();
      } catch {
        showToast("Please refresh the page manually (F5)", true);
      }
      return;
    }

    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(corrected);
        showToast("Copied");
      } catch {
        const ta = panel.querySelector(".gg-corrected");
        if (ta) {
          ta.focus();
          ta.select();
          try {
            document.execCommand("copy");
            showToast("Copied");
          } catch {
            showToast("Copy failed", true);
          }
        } else {
          showToast("Copy failed", true);
        }
      }
      return;
    }

    if (action === "replace-typing") {
      if (typing) return;
      // Type the correction with real key events. Never falls back to a paste.
      const typedResult = await replaceByTyping(corrected);
      if (typedResult === "typed") {
        selectionState = emptySelection();
        hideToolbar();
        showToast("Typed");
        setTimeout(hidePanel, 700);
      }
      return;
    }

    if (action === "replace") {
      if (typing) return;
      const editable = selectionState.editable;
      const ok = replaceSelection(corrected);
      if (ok) {
        settleSelectionAfterReplace(editable);
        // Draft.js may reconcile its DOM/selection just after the input event.
        // Normalize once more after that render, but never steal focus back.
        requestAnimationFrame(() => {
          const liveSelection = window.getSelection();
          if (document.activeElement === editable && liveSelection?.isCollapsed) {
            settleSelectionAfterReplace(editable);
          }
        });
        selectionState = emptySelection();
        hideToolbar();
        showToast("Replaced");
        setTimeout(hidePanel, 500);
      } else {
        try {
          await navigator.clipboard.writeText(corrected);
          showToast("Could not replace — copied instead", true);
        } catch {
          showToast("Could not replace selection", true);
        }
      }
      return;
    }

    if (action === "redo" || action === "redo-quality") {
      if (loading) return;
      const req = lastCheckRequest;
      if (!req?.text) {
        showToast("Nothing to redo", true);
        return;
      }
      if (action === "redo-quality") {
        runCheck(req.mode, req.text, {
          model: QUALITY_MODEL,
          loadingHint: QUALITY_MODEL,
        });
      } else {
        // Same check again with the model saved in the extension popup.
        runCheck(req.mode, req.text);
      }
    }
  });

  /** @param {number} [durationMs] 0 keeps the toast until the next one. */
  function showToast(msg, isErr, durationMs = 1800) {
    const node = panel.querySelector(".gg-toast");
    if (!node) return;
    node.hidden = false;
    node.textContent = msg;
    node.classList.toggle("gg-toast-err", Boolean(isErr));
    clearTimeout(toastTimer);
    if (durationMs > 0) {
      toastTimer = setTimeout(() => {
        node.hidden = true;
      }, durationMs);
    }
  }

  /**
   * Select the original text in its field again, then let the background type the
   * correction over it with real key events, like a person retyping it.
   * @returns {Promise<"typed" | "cancelled" | "failed">}
   */
  async function replaceByTyping(text) {
    const editable = selectionState.editable;
    if (!text || !isWritableEditable(editable) || !selectOriginalForTyping(editable)) {
      showToast("Could not find the original text. Use Replace or Copy.", true, 4000);
      return "failed";
    }

    typing = true;
    showToast("Typing\u2026 click the page or press Escape to stop", false, 0);
    try {
      const res = await sendToBackground({ type: "TYPE_TEXT", text });
      if (res?.ok) return "typed";
      if (res?.cancelled) {
        const progress =
          typeof res.typed === "number" && typeof res.total === "number"
            ? ` after ${res.typed} of ${res.total} characters`
            : "";
        showToast(`Typing stopped${progress}. Ctrl+Z undoes it.`, true, 4000);
        return "cancelled";
      }
      showToast(String(res?.error || "Typing failed.").slice(0, 200), true, 5000);
      return "failed";
    } catch (err) {
      showToast(String(err?.message || err).slice(0, 200), true, 5000);
      return "failed";
    } finally {
      typing = false;
    }
  }

  function stopTyping() {
    if (!typing || !isRuntimeAlive()) return;
    chrome.runtime.sendMessage({ type: "TYPE_CANCEL" }).catch(() => {
      /* typing already finished */
    });
  }

  /** Focus the field and select exactly the originally checked text. */
  function selectOriginalForTyping(editable) {
    const original = selectionState.text || "";
    if (!original) return false;

    if (isWritableTextField(editable)) {
      const range = locateInTextControl(editable, original);
      if (!range) return false;
      try {
        editable.focus();
        editable.setSelectionRange(range.start, range.end);
        return editable.selectionStart === range.start && editable.selectionEnd === range.end;
      } catch {
        return false;
      }
    }

    try {
      editable.focus();
    } catch {
      /* ignore */
    }
    const range = restoreRange();
    const sel = window.getSelection();
    if (!range || !sel || sel.isCollapsed) return false;
    const norm = (v) => String(v).replace(/\s+/g, " ").trim();
    return norm(sel.toString()) === norm(original);
  }

  /** Where the original selection sits in an input/textarea now (or null). */
  function locateInTextControl(el, original) {
    const value = el.value;
    const start = selectionState.start;
    const end = selectionState.end;
    if (typeof start === "number" && typeof end === "number" && value.slice(start, end) === original) {
      return { start, end };
    }
    let idx = -1;
    if (typeof start === "number" && start >= 0) idx = value.indexOf(original, Math.max(0, start - 1));
    if (idx === -1) idx = value.indexOf(original);
    return idx === -1 ? null : { start: idx, end: idx + original.length };
  }

  /**
   * Replace only the previously selected span with `replacement`.
   * Must never delete selection without successfully inserting the new text
   * (that bug left partial selections wiped with no substitute).
   */
  function replaceSelection(replacement) {
    const text = String(replacement ?? "");
    const original = selectionState.text || "";
    const editable = selectionState.editable;

    if (isWritableTextField(editable)) {
      return replaceInTextControl(editable, text, original);
    }

    if (isWritableRichEditable(editable)) {
      return replaceInRichEditable(editable, text, original);
    }

    return false;
  }

  function fireTextInputEvent(el, data) {
    try {
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertReplacementText",
          data: data,
        })
      );
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function findEdgeTextNode(node, fromEnd) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;

    const children = node.childNodes;
    if (!children?.length) return null;

    if (fromEnd) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const found = findEdgeTextNode(children[i], true);
        if (found) return found;
      }
      return null;
    }

    for (let i = 0; i < children.length; i += 1) {
      const found = findEdgeTextNode(children[i], false);
      if (found) return found;
    }
    return null;
  }

  /**
   * Leave a normal collapsed caret and discard the Range retained for Replace.
   * Draft.js can leave a collapsed caret on the editor root after insertText;
   * move that boundary into a real text node so the next edit is accepted.
   */
  function settleSelectionAfterReplace(editable) {
    if (isTextField(editable)) {
      try {
        const caret =
          typeof editable.selectionEnd === "number"
            ? editable.selectionEnd
            : editable.value.length;
        editable.setSelectionRange(caret, caret);
      } catch {
        /* unsupported input type */
      }
      return;
    }

    if (!isWritableRichEditable(editable)) return;

    try {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;

      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(false);

      const container = range.endContainer;
      if (container.nodeType === Node.TEXT_NODE && editable.contains(container)) {
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      if (
        container.nodeType !== Node.ELEMENT_NODE ||
        (container !== editable && !editable.contains(container))
      ) {
        return;
      }

      const childBefore =
        range.endOffset > 0 ? container.childNodes[range.endOffset - 1] : null;
      const childAfter = container.childNodes[range.endOffset] || null;
      const textBefore = findEdgeTextNode(childBefore, true);
      const textAfter = findEdgeTextNode(childAfter, false);
      const target = textBefore || textAfter;
      if (!target) return;

      const caret = document.createRange();
      const offset = textBefore ? target.textContent.length : 0;
      caret.setStart(target, offset);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    } catch {
      /* selection may have been invalidated by the host editor */
    }
  }

  function replaceInTextControl(el, text, original) {
    const value = el.value;
    let start = selectionState.start;
    let end = selectionState.end;

    // 1) Stored offsets still point at the original slice
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      end > start &&
      start >= 0 &&
      end <= value.length
    ) {
      const slice = value.slice(start, end);
      if (!original || slice === original) {
        return applyTextControlRange(el, start, end, text);
      }
      // Offsets drifted but original still sits at start…
      if (original && value.slice(start, start + original.length) === original) {
        return applyTextControlRange(el, start, start + original.length, text);
      }
    }

    // 2) Live selection in this field
    {
      const liveStart = el.selectionStart;
      const liveEnd = el.selectionEnd;
      if (
        typeof liveStart === "number" &&
        typeof liveEnd === "number" &&
        liveEnd > liveStart
      ) {
        const slice = value.slice(liveStart, liveEnd);
        if (!original || slice === original) {
          return applyTextControlRange(el, liveStart, liveEnd, text);
        }
      }
    }

    // 3) Locate original substring (prefer near stored start)
    if (original) {
      let idx = -1;
      if (typeof start === "number" && start >= 0) {
        const at = value.indexOf(original, Math.max(0, start - 1));
        if (at !== -1) idx = at;
      }
      if (idx === -1) idx = value.indexOf(original);
      if (idx !== -1) {
        return applyTextControlRange(el, idx, idx + original.length, text);
      }
    }

    return false;
  }

  function applyTextControlRange(el, start, end, text) {
    if (typeof start !== "number" || typeof end !== "number" || end < start) {
      return false;
    }
    if (start < 0 || end > el.value.length) return false;

    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const expected = before + text + after;

    el.focus();

    // setRangeText correctly replaces a sub-range without wiping the rest
    try {
      if (typeof el.setRangeText === "function") {
        el.setSelectionRange(start, end);
        el.setRangeText(text, start, end, "end");
      } else {
        el.value = expected;
        const caret = start + text.length;
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* some input types */
        }
      }
    } catch {
      el.value = expected;
    }

    // Framework-controlled fields sometimes ignore setRangeText — force value
    if (el.value !== expected) {
      el.value = expected;
      try {
        el.setSelectionRange(start + text.length, start + text.length);
      } catch {
        /* ignore */
      }
    }

    fireTextInputEvent(el, text);

    // Verify: partial selection must become `text`, surroundings preserved
    if (el.value === expected) return true;
    if (el.value.slice(start, start + text.length) === text) return true;
    // Last resort force
    el.value = expected;
    fireTextInputEvent(el, text);
    return el.value === expected;
  }

  function snapshotRichText(root) {
    if (!root) {
      return window.getSelection()?.toString() ?? "";
    }
    return root.innerText ?? root.textContent ?? "";
  }

  function restoreRange() {
    if (!selectionState.range) return null;
    try {
      const range = selectionState.range.cloneRange();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * Direct Range/textContent mutation is safe only for plain browser-managed
   * contenteditables. Stateful editors keep a separate document model; changing
   * their DOM behind that model creates visible but non-editable "ghost" text.
   */
  function canUseDirectRichFallback(root) {
    if (!(root instanceof HTMLElement) || !root.isContentEditable) return false;
    if (root.getAttribute("role") === "textbox") return false;

    const frameworkMarkers = [
      '[data-testid^="tweetTextarea_"]',
      '[data-contents="true"]',
      '[data-block="true"]',
      "[data-offset-key]",
      '[data-text="true"]',
      '[data-lexical-editor="true"]',
      '[data-slate-editor="true"]',
      ".ProseMirror",
    ].join(",");

    return !root.matches(frameworkMarkers) && !root.querySelector(frameworkMarkers);
  }

  function isDraftRichEditor(root) {
    return Boolean(
      root instanceof HTMLElement &&
        (root.classList.contains("public-DraftEditor-content") ||
          root.matches('[data-testid^="tweetTextarea_"]') ||
          root.querySelector('[data-contents="true"] [data-block="true"][data-offset-key]'))
    );
  }

  /**
   * Draft.js is a controlled editor backed by immutable EditorState. A direct
   * DOM mutation can look correct while leaving its model stale. Its paste
   * handler performs the replacement through DraftModifier and updates both.
   */
  function replaceThroughDraftPaste(root, text, original) {
    const sel = window.getSelection();
    const range = restoreRange();
    if (!range || !sel || sel.isCollapsed) return false;

    try {
      const beforeSnap = snapshotRichText(root);
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData,
      });

      root.dispatchEvent(pasteEvent);
      const afterSnap = snapshotRichText(root);
      return (
        pasteEvent.defaultPrevented &&
        richReplaceLooksGood(beforeSnap, afterSnap, original, text)
      );
    } catch {
      return false;
    }
  }

  function replaceInRichEditable(editable, text, original) {
    const root =
      editable ||
      (selectionState.range?.commonAncestorContainer
        ? selectionState.range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? selectionState.range.commonAncestorContainer
          : selectionState.range.commonAncestorContainer.parentElement
        : null);

    if (root && typeof root.focus === "function") {
      try {
        root.focus();
      } catch {
        /* ignore */
      }
    }

    const beforeSnap = snapshotRichText(root);
    const sel = window.getSelection();
    const allowDirectFallback = canUseDirectRichFallback(root);

    // X uses Draft.js. Let Draft's own paste handler update its immutable
    // EditorState; never follow a failed attempt with ghost-producing DOM edits.
    if (isDraftRichEditor(root)) {
      return replaceThroughDraftPaste(root, text, original);
    }

    // --- Method A: insertText over restored selection (atomic replace) ---
    let range = restoreRange();
    if (range && sel && !sel.isCollapsed) {
      try {
        const ok = document.execCommand("insertText", false, text);
        const afterSnap = snapshotRichText(root);
        if (ok && richReplaceLooksGood(beforeSnap, afterSnap, original, text)) {
          // Chrome already emitted its trusted input transaction for execCommand.
          // A second synthetic InputEvent can be replayed by some rich editors.
          return true;
        }
        // execCommand may return true yet do nothing useful — do not stop if snap unchanged wrong way
        if (ok && afterSnap !== beforeSnap && (!text || afterSnap.includes(text))) {
          return true;
        }
      } catch {
        /* try next method */
      }
    }

    // --- Method B: Range API — replace as one unit; restore original if insert fails ---
    range = allowDirectFallback ? restoreRange() : null;
    if (range) {
      try {
        const selectedNow = range.toString();
        const expectOriginal = original || selectedNow;

        // Build replacement first; only then mutate the range
        const node = document.createTextNode(text);
        range.deleteContents();
        range.insertNode(node);

        if (!node.isConnected) {
          // Insert never stuck — put original text back at the collapsed caret
          if (expectOriginal) {
            try {
              const back = document.createTextNode(expectOriginal);
              range.insertNode(back);
              dispatchRichInput(root, expectOriginal);
            } catch {
              /* ignore */
            }
          }
        } else {
          try {
            const after = document.createRange();
            after.setStartAfter(node);
            after.collapse(true);
            sel.removeAllRanges();
            sel.addRange(after);
          } catch {
            /* ignore caret */
          }
          dispatchRichInput(root, text);
          const afterSnap = snapshotRichText(root);
          if (richReplaceLooksGood(beforeSnap, afterSnap, expectOriginal, text)) {
            return true;
          }
          // Editor swallowed our node — try restore original if new text missing
          if (text && expectOriginal && !afterSnap.includes(text)) {
            try {
              if (node.isConnected) node.textContent = expectOriginal;
              else range.insertNode(document.createTextNode(expectOriginal));
              dispatchRichInput(root, expectOriginal);
            } catch {
              /* ignore */
            }
          } else if (text && afterSnap.includes(text)) {
            return true;
          }
        }
      } catch {
        /* try next */
      }
    }

    // --- Method C: string rebuild for simple single-text-node editables ---
    if (allowDirectFallback && root && original && typeof root.innerText === "string") {
      try {
        const full = root.innerText;
        const idx = full.indexOf(original);
        if (idx !== -1) {
          const next = full.slice(0, idx) + text + full.slice(idx + original.length);
          // Only for plain text-like CE (avoid wiping complex Twitter draft trees)
          const plain =
            root.childNodes.length <= 3 &&
            !root.querySelector?.("div,span[data-text],br");
          if (plain) {
            root.textContent = next;
            dispatchRichInput(root, text);
            if (snapshotRichText(root).includes(text) || text === "") return true;
          }
        }
      } catch {
        /* ignore */
      }
    }

    return false;
  }

  function richReplaceLooksGood(before, after, original, text) {
    if (before === after && text !== original) {
      // No DOM change
      return false;
    }
    if (text && !after.includes(text)) {
      // New text never appeared — treat as failure (avoids "delete only")
      // Exception: whitespace-normalized editors
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      if (!norm(after).includes(norm(text))) return false;
    }
    if (original && text !== original && after.includes(original) && !after.includes(text)) {
      return false;
    }
    return true;
  }

  function dispatchRichInput(root, data) {
    if (!root) return;
    try {
      root.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: data,
        })
      );
    } catch {
      root.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }
  } // bootstrap
})();
