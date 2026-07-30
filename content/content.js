/**
 * Grammar Grok — content script
 * Selection toolbar + result panel (closed Shadow DOM).
 * No API key access; checks go through the background worker.
 */

(() => {
  // Prefer DOM marker over window globals (isolated world, but avoid page fights)
  const HOST_ID = "grammar-grok-host";
  if (document.getElementById(HOST_ID)) return;

  const MIN_LEN = 3;
  const MAX_SEND_CHARS = 8000;
  const Z = 2147483646;
  const SYNC_MS = 48;
  const MAX_ISSUES_UI = 40;
  const MSG_RETRIES = 4;

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
      width: 100%;
      min-height: 100px;
      resize: vertical;
      background: #0e0e1c;
      border: 1px solid #343454;
      border-radius: 8px;
      color: #f2f2fa;
      padding: 10px;
      font: inherit;
      line-height: 1.5;
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
  `;

  /** @type {{ text: string, range: Range | null, editable: HTMLElement | null, start: number | null, end: number | null }} */
  let selectionState = emptySelection();
  let loading = false;
  let debounceTimer = null;
  let toastTimer = null;
  /** @type {string | null} */
  let correctedCache = null;
  let checkSeq = 0;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-grammar-grok", "1");
  host.style.cssText = `all:initial;position:fixed;inset:0;pointer-events:none;z-index:${Z};`;

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CSS;
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
  toolbar.append(btnGrammar, sep, btnStyle);
  shadow.appendChild(toolbar);

  const toolbarButtons = [btnGrammar, btnStyle];

  const panel = document.createElement("div");
  panel.className = "gg-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Grammar Grok result");
  shadow.appendChild(panel);

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
    if (!document.documentElement.contains(host)) {
      document.documentElement.appendChild(host);
    }
  }

  mountHost();

  function isTextField(el) {
    return (
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement &&
        /^(text|search|email|url|tel|password|number|)$/i.test(el.type || "text"))
    );
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

  function hidePanel() {
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
    if (loading) return;
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

  document.addEventListener(
    "keyup",
    (e) => {
      if (
        e.key === "Shift" ||
        e.key.startsWith("Arrow") ||
        e.key === "End" ||
        e.key === "Home"
      ) {
        debounce(showToolbar, 10);
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
        hideToolbar();
        hidePanel();
        loading = false;
        setToolbarLoading(false);
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
    const btn = e.target.closest?.("[data-mode]");
    if (!btn || loading) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = btn.getAttribute("data-mode") === "style" ? "style" : "grammar";
    const text = selectionState.text || captureSelection()?.text || "";
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN) return;
    if (trimmed.length > MAX_SEND_CHARS) {
      showErrorPanel(
        `Selection is too long (${trimmed.length} chars). Maximum is ${MAX_SEND_CHARS}.`
      );
      return;
    }
    runCheck(mode, text);
  });

  async function runCheck(mode, text) {
    const seq = ++checkSeq;
    loading = true;
    setToolbarLoading(true);
    showLoadingPanel(mode);

    try {
      // Warm-up then check (helps after idle tabs / X SPA compose modals)
      try {
        await sendToBackground({ type: "PING" });
      } catch (err) {
        if (isContextInvalidError(err)) throw err;
        // ignore soft ping failures; CHECK_TEXT still retries
      }

      const res = await sendToBackground({
        type: "CHECK_TEXT",
        mode,
        text,
      });
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

  function showLoadingPanel(mode) {
    mountHost();
    clearPanel();
    revealPanel();
    const label = mode === "style" ? "Grammar + Style" : "Grammar";
    const head = el("div", "gg-panel-head");
    head.append(el("span", "gg-title", "Checking…"), makeCloseBtn());
    const body = el("div", "gg-body");
    body.append(el("div", "gg-spinner"), el("p", "gg-muted center", `${label} · language auto-detect`));
    panel.append(head, body);
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

    const modeLabel = data.mode === "style" ? "Grammar + Style" : "Grammar";
    const lang = String(data.languageName || data.language || "Unknown").slice(0, 64);
    const issues = Array.isArray(data.issues)
      ? data.issues.slice(0, MAX_ISSUES_UI)
      : [];
    const canReplace = Boolean(selectionState.editable || selectionState.range);
    const corrected = String(data.corrected ?? "");
    correctedCache = corrected;

    const head = el("div", "gg-panel-head");
    const left = el("div", "gg-head-left");
    left.append(
      el("span", "gg-title", data.hasChanges ? "Suggestions" : "Looks good"),
      el("span", "gg-badge", lang),
      el("span", "gg-badge gg-badge-muted", modeLabel)
    );
    head.append(left, makeCloseBtn());

    const body = el("div", "gg-body");
    if (data.summary) {
      body.append(el("p", "gg-summary", String(data.summary).slice(0, 400)));
    }
    body.append(el("label", "gg-label", "Corrected text"));
    const ta = document.createElement("textarea");
    ta.className = "gg-corrected";
    ta.readOnly = true;
    ta.rows = 6;
    ta.value = corrected;
    body.append(ta);

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
      foot.append(rep);
    }
    const close = el("button", "gg-action", "Close");
    close.type = "button";
    close.dataset.action = "close";
    foot.append(close);

    const toast = el("div", "gg-toast");
    toast.hidden = true;

    panel.append(head, body, foot, toast);
  }

  function clearPanel() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
  }

  panel.addEventListener("click", async (e) => {
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

    if (action === "replace") {
      const ok = replaceSelection(corrected);
      if (ok) {
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
    }
  });

  function showToast(msg, isErr) {
    const node = panel.querySelector(".gg-toast");
    if (!node) return;
    node.hidden = false;
    node.textContent = msg;
    node.classList.toggle("gg-toast-err", Boolean(isErr));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 1800);
  }

  function replaceSelection(text) {
    const editable = selectionState.editable;

    if (
      editable instanceof HTMLInputElement ||
      editable instanceof HTMLTextAreaElement
    ) {
      let start = selectionState.start;
      let end = selectionState.end;
      if (typeof start !== "number" || typeof end !== "number") {
        start = editable.selectionStart;
        end = editable.selectionEnd;
      }
      if (typeof start === "number" && typeof end === "number" && end > start) {
        // Verify the slice still matches what we checked (avoid wrong replace)
        const current = editable.value.slice(start, end);
        if (
          selectionState.text &&
          current !== selectionState.text &&
          !editable.value.includes(selectionState.text)
        ) {
          // Fall through to includes-based replace
        } else if (current === selectionState.text || !selectionState.text) {
          const before = editable.value.slice(0, start);
          const after = editable.value.slice(end);
          editable.focus();
          editable.value = before + text + after;
          const caret = start + text.length;
          editable.setSelectionRange(caret, caret);
          editable.dispatchEvent(new Event("input", { bubbles: true }));
          editable.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      if (selectionState.text) {
        const idx = editable.value.indexOf(selectionState.text);
        if (idx !== -1) {
          editable.focus();
          editable.value =
            editable.value.slice(0, idx) +
            text +
            editable.value.slice(idx + selectionState.text.length);
          editable.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
    }

    if (editable?.isContentEditable) {
      editable.focus();
      const sel = window.getSelection();
      try {
        if (selectionState.range) {
          sel.removeAllRanges();
          sel.addRange(selectionState.range);
        }
      } catch {
        /* ignore */
      }
      if (document.execCommand("insertText", false, text)) return true;
      try {
        if (selectionState.range) {
          selectionState.range.deleteContents();
          selectionState.range.insertNode(document.createTextNode(text));
          return true;
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const sel = window.getSelection();
      if (selectionState.range) {
        sel.removeAllRanges();
        sel.addRange(selectionState.range);
        if (document.execCommand("insertText", false, text)) return true;
      }
    } catch {
      /* ignore */
    }

    return false;
  }
})();
