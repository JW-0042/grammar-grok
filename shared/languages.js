/**
 * Grammar Grok — shared settings catalog (service worker via importScripts, popup via <script>).
 * Translation languages and the toolbar items the user can show.
 */

/* exported GG_LANGUAGES, GG_DEFAULT_TRANSLATE_LANGUAGES, GG_DEFAULT_TOOLBAR_ITEMS,
   GG_BASE_TOOLBAR_ITEMS, ggLanguage, ggSanitizeLanguages, ggSanitizeToolbar, ggToolbarItem */

/** Languages a result can be translated into. `label` is the short button text. */
const GG_LANGUAGES = Object.freeze([
  { code: "sk", name: "Slovak", label: "SK" },
  { code: "cs", name: "Czech", label: "CZ" },
  { code: "en", name: "English", label: "EN" },
  { code: "de", name: "German", label: "DE" },
  { code: "pl", name: "Polish", label: "PL" },
  { code: "hu", name: "Hungarian", label: "HU" },
  { code: "uk", name: "Ukrainian", label: "UA" },
  { code: "ru", name: "Russian", label: "RU" },
  { code: "fr", name: "French", label: "FR" },
  { code: "es", name: "Spanish", label: "ES" },
  { code: "it", name: "Italian", label: "IT" },
  { code: "pt", name: "Portuguese", label: "PT" },
  { code: "nl", name: "Dutch", label: "NL" },
  { code: "ro", name: "Romanian", label: "RO" },
  { code: "hr", name: "Croatian", label: "HR" },
  { code: "sl", name: "Slovenian", label: "SL" },
  { code: "sr", name: "Serbian", label: "SR" },
  { code: "bg", name: "Bulgarian", label: "BG" },
  { code: "el", name: "Greek", label: "EL" },
  { code: "sv", name: "Swedish", label: "SV" },
  { code: "da", name: "Danish", label: "DA" },
  { code: "fi", name: "Finnish", label: "FI" },
  { code: "no", name: "Norwegian", label: "NO" },
  { code: "tr", name: "Turkish", label: "TR" },
  { code: "ja", name: "Japanese", label: "JA" },
  { code: "zh", name: "Chinese (Simplified)", label: "ZH" },
  { code: "ko", name: "Korean", label: "KO" },
  { code: "ar", name: "Arabic", label: "AR" },
]);

/** Shown as translate buttons in the result panel until the user changes them. */
const GG_DEFAULT_TRANSLATE_LANGUAGES = Object.freeze(["sk", "cs", "en"]);

/** Toolbar modes that do not depend on a language. */
const GG_BASE_TOOLBAR_ITEMS = Object.freeze([
  { id: "grammar", mode: "grammar", ico: "✓", label: "Grammar", title: "Fix grammar, spelling, punctuation" },
  { id: "style", mode: "style", ico: "✎", label: "Grammar + Style", title: "Grammar + style / clarity, with the final AI text check" },
  { id: "quick", mode: "quick", ico: "⚡", label: "Quick check", title: "Grammar + style without the final AI text check (faster)" },
]);

const GG_DEFAULT_TOOLBAR_ITEMS = Object.freeze(["grammar", "style", "quick", "translate:en", "translate:cs"]);

function ggLanguage(code) {
  const c = String(code || "").trim().toLowerCase();
  return GG_LANGUAGES.find((l) => l.code === c) || null;
}

/** Valid, unique language codes in the user's order; defaults when nothing usable is stored. */
function ggSanitizeLanguages(list) {
  if (!Array.isArray(list)) return [...GG_DEFAULT_TRANSLATE_LANGUAGES];
  const out = [];
  for (const code of list) {
    const lang = ggLanguage(code);
    if (lang && !out.includes(lang.code)) out.push(lang.code);
  }
  return out.length > 0 ? out : [...GG_DEFAULT_TRANSLATE_LANGUAGES];
}

/** Toolbar item description for an id such as "grammar" or "translate:cs" (or null). */
function ggToolbarItem(id) {
  const value = String(id || "");
  const base = GG_BASE_TOOLBAR_ITEMS.find((item) => item.id === value);
  if (base) return { ...base };
  const match = /^translate:([a-z]{2})$/.exec(value);
  const lang = match && ggLanguage(match[1]);
  if (!lang) return null;
  return {
    id: `translate:${lang.code}`,
    mode: "translate",
    target: lang.code,
    ico: lang.label,
    label: `Translate to ${lang.label}`,
    title: `Translate selection to ${lang.name}`,
  };
}

/**
 * Toolbar ids that are valid for the enabled languages, in a stable order:
 * base modes first, then translations in the order of the language list.
 */
function ggSanitizeToolbar(items, languages) {
  const langs = ggSanitizeLanguages(languages);
  const wanted = new Set(Array.isArray(items) ? items.map(String) : GG_DEFAULT_TOOLBAR_ITEMS);
  const ordered = [
    ...GG_BASE_TOOLBAR_ITEMS.map((item) => item.id),
    ...langs.map((code) => `translate:${code}`),
  ];
  const out = ordered.filter((id) => wanted.has(id));
  if (out.length > 0) return out;
  const fallback = ordered.filter((id) => GG_DEFAULT_TOOLBAR_ITEMS.includes(id));
  return fallback.length > 0 ? fallback : GG_BASE_TOOLBAR_ITEMS.map((item) => item.id);
}
