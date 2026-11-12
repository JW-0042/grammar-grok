const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const toggleKeyBtn = document.getElementById("toggleKey");
const statusEl = document.getElementById("status");
const toolbarItemsEl = document.getElementById("toolbarItems");
const languagesEl = document.getElementById("languages");

/** Toolbar and translation settings, kept in sync with storage on every change. */
let uiSettings = {
  translateLanguages: [...GG_DEFAULT_TRANSLATE_LANGUAGES],
  toolbarItems: [...GG_DEFAULT_TOOLBAR_ITEMS],
};

const DEFAULT_MODEL = "grok-4.5";
const ALLOWED_MODELS = new Set([
  "grok-4.7",
  "grok-4.6",
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

function makeCheck(labelText, checked, title) {
  const label = document.createElement("label");
  label.className = "check";
  if (title) label.title = title;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(input, span);
  return { label, input };
}

function renderUiSettings() {
  const languages = ggSanitizeLanguages(uiSettings.translateLanguages);
  const toolbar = ggSanitizeToolbar(uiSettings.toolbarItems, languages);
  uiSettings = { translateLanguages: languages, toolbarItems: toolbar };

  toolbarItemsEl.replaceChildren();
  const available = [
    ...GG_BASE_TOOLBAR_ITEMS.map((item) => item.id),
    ...languages.map((code) => `translate:${code}`),
  ];
  for (const id of available) {
    const item = ggToolbarItem(id);
    const { label, input } = makeCheck(item.label, toolbar.includes(id), item.title);
    input.addEventListener("change", () => {
      const next = input.checked
        ? [...uiSettings.toolbarItems, id]
        : uiSettings.toolbarItems.filter((v) => v !== id);
      if (next.length === 0) {
        input.checked = true;
        setStatus("Keep at least one toolbar button.", "err");
        return;
      }
      saveUiSettings({ toolbarItems: next });
    });
    toolbarItemsEl.append(label);
  }

  languagesEl.replaceChildren();
  for (const lang of GG_LANGUAGES) {
    const { label, input } = makeCheck(`${lang.label} ${lang.name}`, languages.includes(lang.code), lang.name);
    input.addEventListener("change", () => {
      const next = input.checked
        ? [...uiSettings.translateLanguages, lang.code]
        : uiSettings.translateLanguages.filter((v) => v !== lang.code);
      if (next.length === 0) {
        input.checked = true;
        setStatus("Keep at least one translation language.", "err");
        return;
      }
      saveUiSettings({ translateLanguages: next });
    });
    languagesEl.append(label);
  }
}

async function saveUiSettings(change) {
  uiSettings = { ...uiSettings, ...change };
  renderUiSettings();
  await chrome.storage.local.set(uiSettings);
  setStatus("Saved. Select text again to see the new toolbar.", "ok");
}

async function load() {
  const data = await chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL,
    translateLanguages: [...GG_DEFAULT_TRANSLATE_LANGUAGES],
    toolbarItems: [...GG_DEFAULT_TOOLBAR_ITEMS],
  });
  apiKeyEl.value = data.apiKey || "";
  modelEl.value = sanitizeModel(data.model);
  uiSettings = { translateLanguages: data.translateLanguages, toolbarItems: data.toolbarItems };
  renderUiSettings();
  // 1.3.0 stored a typing switch; typing is now its own button in the result panel.
  try {
    chrome.storage.local.remove("typeLikeHuman")?.catch?.(() => {});
  } catch {
    /* cleanup is optional */
  }
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
