# Architecture

**Current version: 1.4.0**

Grammar Grok is a **Chrome Manifest V3** extension with three runtime parts.

```
┌─────────────────────┐     chrome.runtime      ┌──────────────────────┐
│  Content script     │ ────── sendMessage ────►│  Background worker   │
│  content/content.js │ ◄──── response ─────────│  background.js       │
│  (all frames)       │     PING + CHECK_TEXT   │                      │
│                     │                         │  • read API key      │
│  • text selection   │                         │  • call xAI API      │
│  • toolbar / panel  │                         │  • parse JSON        │
│  • copy / replace   │                         │  • allowlists        │
│  • redo / recheck   │                         │                      │
└─────────────────────┘                         └──────────┬───────────┘
                                                           │ HTTPS
                                                           ▼
                                                ┌──────────────────────┐
                                                │  api.x.ai            │
                                                │  /v1/chat/completions│
                                                └──────────────────────┘

┌─────────────────────┐
│  Popup              │  chrome.storage.local  (API key, model)
│  popup/*            │
└─────────────────────┘
```

## Why this split?

| Concern | Where |
|---------|--------|
| UI on any webpage | Content script (isolated world + closed Shadow DOM) |
| Secrets & network | Background service worker only |
| User settings | Popup writes `chrome.storage.local` |

The content script **never** receives or stores the API key. Pages you visit cannot read extension storage or the service worker memory.

## Data flow (one check)

1. User selects text on an `http(s)` page (top frame or nested frame).  
2. Content script shows a **fixed top toolbar** built from the user's settings (default: Grammar | Grammar + Style | Quick check | Translate to CZ | Translate to EN). It gets them with `GET_UI_CONFIG`, because content scripts do not read storage; the same message wakes the service worker.
3. Content script may **PING** the service worker to wake it (MV3).  
4. On mode click, content script opens a `gg-check-stream` port and sends `{ type: "CHECK_TEXT", mode, text }`. If the port fails before any progress, it falls back to the one-shot `sendMessage` with retries.  
5. Background validates sender, mode, text length, API key, and model allowlist.  
6. Background `POST`s to `https://api.x.ai/v1/chat/completions` with a mode-specific system prompt.  
7. With a port, the request uses `stream: true`; the background sends throttled `preview` events with the partially decoded `corrected` field. Model returns structured JSON (source language, corrected/translated text, issues). Background validates response size and shape, clamps issue fields, and returns the model id used.
7a. **Text check** (`reviewText`): safe character fixes are applied directly; em dashes, semicolons, added symbols, or added stock AI phrases trigger one repair request (original messages + first result + repair instruction), then `applyPunctuationFallback` removes any remaining em dashes and semicolons. A repair is kept only when it lowers the problem count. Emoticons, file paths and the author's own quotations are protected spans, and stock phrases are compared without diacritics and with a small typo tolerance. The result carries `textCheck: { autoFixed, repaired, reworked, remaining }`.
8. Content script renders the result panel (DOM nodes only) and offers Copy / Replace / Replace by typing / Redo / optional one-shot Grok 4.5 (including after Translate to EN).

Optional: result-panel **Redo** re-sends the same text/mode. **Grok 4.5** sends the same request with `{ model: "grok-4.5" }` for one request only (saved popup model is unchanged). Background still allowlists the override.

Checks use xAI JSON mode. Leading/trailing selection whitespace is kept outside the model request and restored around the result. Active requests are tracked per tab/frame, so a new check only cancels an older request from the same content-script scope.

All three modes share `HUMAN_WRITING_RULES` (plain everyday wording, nothing more complex than the original, no em dashes, semicolons, or added typographic characters). Grammar allows minimal edits to satisfy these rules. Code, URLs, and verbatim quotations are preserved. The prompt rules are backed by the deterministic text check above. Stock-phrase detection runs only for Grammar and Grammar + Style, because a translation is compared with text in another language.

`grok-4.5`, `grok-4.6`, and `grok-4.7` requests set `reasoning_effort` to `low` so the default high reasoning pass does not blow the 60-second timeout. This includes the one-shot Grok 4.5 button. The popup labels **grok-4.20 non-reasoning** as recommended; that label does not change the saved model, and an empty storage value still resolves to `grok-4.5`. Grok 4.7 Fast is not allowlisted: xAI offers it only through Cursor and Grok Build.

### Messaging resilience (1.1.1+)

| Situation | Behavior |
|-----------|----------|
| Service worker asleep | `PING` + retries on `CHECK_TEXT`; `connect()` also wakes it |
| Panel closed / Escape during a check | Port disconnected; background aborts the API request |
| Extension reloaded while tab open | Detect *context invalidated*; show **Refresh page** |
| No receiver briefly | Retry with short backoff |

## Modes

| Mode | Prompt intent |
|------|----------------|
| `grammar` | Spelling, grammar, punctuation, diacritics only |
| `style` | Grammar + clarity, flow, word choice (same meaning) |
| `quick` | The `style` prompt, without the final text check (one request, `textCheck: null`) |
| `translate` | Translate into `target` (a code from `shared/languages.js`, English if unknown); `corrected` is the translation |

Language is **auto-detected** by the model (English, Czech, Slovak, and others). `translate` reports the source language and writes the target language into `corrected`. The panel's **Translate result to** buttons run `translate` on the current result; `checkedSelection` is unchanged, so Replace still targets the original span.

`shared/languages.js` is loaded by the service worker (`importScripts`), the content script (listed before `content/content.js` in the manifest) and the popup. It defines the language catalog, the default toolbar and translation languages, and the sanitizers every side applies to stored settings (`toolbarItems`, `translateLanguages`).

## Replace by typing (1.3.0+, own button since 1.3.1)

1. After a trusted click on **Replace by typing**, the content script selects the checked span again (`checkedSelection`, a snapshot taken when the check started, not the live selection) (`setSelectionRange` for fields, the saved Range for rich editors) and verifies it matches the checked text.
2. It sends `{ type: "TYPE_TEXT", text }`. The background accepts it only from a content script with a tab.
3. Background attaches `chrome.debugger` to that tab and sends `Input.dispatchKeyEvent` keyDown/keyUp pairs per character (Enter for line breaks, `Input.insertText` for emoji and tabs) with `humanDelay()` pauses. The first key replaces the selection, exactly like a person typing over selected text.
4. A trusted click, Escape (`TYPE_CANCEL`), or Chrome's debugging-bar Cancel (`onDetach`) stops the loop. The debugger is always detached in `finally`.
5. If the span cannot be selected again or typing cannot start, the panel shows an error. It never falls back to a paste. The plain **Replace** button uses the one-step strategy below.

Verified in Chrome 156 against a `<textarea>`, a plain `contenteditable`, and Draft.js 0.11: model and DOM text match, the editor stays editable, all key events are trusted, and no paste event fires.

## Replace strategy without typing (1.1.2+)

| Target | Strategy |
|--------|----------|
| `input` / `textarea` | `setRangeText` or `before + corrected + after` using stored offsets; fire one replacement `input` event |
| Plain `contenteditable` | Prefer `document.execCommand("insertText")`; fallback Range API with **verification**; restore original if insert fails |
| X / Draft.js | Dispatch a scoped synthetic plain-text paste so Draft's own handler updates immutable `EditorState` and DOM together; no system clipboard access |
| Other stateful rich editor (`role="textbox"`, Lexical/Slate/ProseMirror markers) | Native `insertText` only; if it fails, return false so the UI copies instead of creating non-editable “ghost” DOM |
| Failure | Return false → UI may copy instead of claiming a bad replace |

**Invariant:** never delete the selected range unless the correction is successfully inserted (or original is restored).

After success, the live selection is collapsed and the stored replacement Range is discarded. If Draft.js leaves the caret on the editor root, it is moved into the nearest real text node so further typing is accepted. The `execCommand("insertText")` path relies on Chrome's native input event instead of emitting a duplicate synthetic transaction (**1.1.6+**).

## Permissions

```json
"permissions": ["storage", "debugger"],
"host_permissions": ["https://api.x.ai/*"]
```

- `storage` — save API key and model preference locally
- `debugger` — type a Replace with real key events (see below). Chrome does not allow this permission to be optional  
- `host_permissions` — only xAI API (not arbitrary sites)

### Content scripts

```json
"matches": ["http://*/*", "https://*/*"],
"all_frames": true,
"match_about_blank": true,
"match_origin_as_fallback": true
```

Excludes Chrome Web Store URLs. Runs in nested frames so reply composers in iframes still work.

## Security controls (summary)

- Trusted message senders only (`chrome.runtime.id`); `TEST_KEY` only from extension pages; streaming ports only from content scripts in a tab  
- Password fields excluded; toolbar/panel actions require `event.isTrusted`  
- `chrome.storage.local` restricted to trusted contexts where supported  
- Model allowlist  
- Request timeout / abort of overlapping checks within the same tab/frame
- Light client-side rate spacing  
- Error messages scrubbed of key-like patterns  
- No remote scripts; MV3 CSP on extension pages  
- UI uses `textContent` / DOM APIs for model output  

See also [SECURITY.md](../SECURITY.md).

## File reference

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 entry points, permissions, content scripts (**v1.4.0**) |
| `background.js` | Grammar/style/translation prompts, fetch, response validation, settings, `PING` / `CHECK_TEXT` / `TEST_KEY` |
| `shared/languages.js` | Language catalog, toolbar items and settings sanitizers shared by all three parts |
| `content/content.js` | Selection UX (mouse + keyboard), configurable toolbar, Shadow DOM UI, messaging retries, replace / redo logic |
| `popup/popup.html` / `.js` / `.css` | Configure key & model |
| `icons/` | 16 / 48 / 128 PNG icons |
| `tests/background.test.js` | Regression tests for translation, validation, output limits, and request concurrency |

## Related docs

- [INSTALLATION.md](INSTALLATION.md)  
- [USAGE.md](USAGE.md)  
- [DEVELOPMENT.md](DEVELOPMENT.md)  
- [CHANGELOG.md](../CHANGELOG.md)  
