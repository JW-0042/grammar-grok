const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const toggleKeyBtn = document.getElementById("toggleKey");
const statusEl = document.getElementById("status");

const DEFAULT_MODEL = "grok-4.5";
const ALLOWED_MODELS = new Set([
  "grok-4.5",
  "grok-4.3",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-0309-reasoning",
]);

function setStatus(msg, kind) {
  statusEl.textContent = msg || "";
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function sanitizeModel(model) {
  const m = String(model || "").trim();
  return ALLOWED_MODELS.has(m) ? m : DEFAULT_MODEL;
}

function looksLikeApiKey(key) {
  if (!key) return false;
  if (key.length < 12 || key.length > 512) return false;
  if (/\s/.test(key)) return false;
  return true;
}

async function load() {
  const data = await chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL,
  });
  apiKeyEl.value = data.apiKey || "";
  modelEl.value = sanitizeModel(data.model);
}

toggleKeyBtn.addEventListener("click", () => {
  const show = apiKeyEl.type === "password";
  apiKeyEl.type = show ? "text" : "password";
  toggleKeyBtn.textContent = show ? "Hide" : "Show";
  toggleKeyBtn.setAttribute("aria-pressed", show ? "true" : "false");
});

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  const model = sanitizeModel(modelEl.value);

  if (apiKey && !looksLikeApiKey(apiKey)) {
    setStatus("That does not look like a valid API key.", "err");
    return;
  }

  await chrome.storage.local.set({ apiKey, model });
  modelEl.value = model;
  setStatus(apiKey ? "Saved." : "Saved (API key cleared).", "ok");
});

testBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  const model = sanitizeModel(modelEl.value);

  if (!apiKey) {
    setStatus("Enter an API key first.", "err");
    return;
  }
  if (!looksLikeApiKey(apiKey)) {
    setStatus("That does not look like a valid API key.", "err");
    return;
  }

  await chrome.storage.local.set({ apiKey, model });
  modelEl.value = model;

  testBtn.disabled = true;
  saveBtn.disabled = true;
  setStatus("Testing…");

  try {
    const res = await chrome.runtime.sendMessage({ type: "TEST_KEY" });
    if (res?.ok) {
      setStatus(`Connected (${res.model}).`, "ok");
    } else {
      setStatus(String(res?.error || "Connection failed."), "err");
    }
  } catch (err) {
    setStatus(err?.message || String(err), "err");
  } finally {
    testBtn.disabled = false;
    saveBtn.disabled = false;
  }
});

// Hide key again if popup loses focus while visible (minor safety)
window.addEventListener("blur", () => {
  if (apiKeyEl.type === "text") {
    apiKeyEl.type = "password";
    toggleKeyBtn.textContent = "Show";
    toggleKeyBtn.setAttribute("aria-pressed", "false");
  }
});

load().catch((err) => setStatus(err?.message || String(err), "err"));
