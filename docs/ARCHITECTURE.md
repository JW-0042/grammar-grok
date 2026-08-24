# Architecture

**Current version: 1.1.5**

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
2. Content script shows a **fixed top toolbar**: Grammar | Grammar + Style | Translate to EN.
3. Content script may **PING** the service worker to wake it (MV3).  
4. On mode click, content script sends `{ type: "CHECK_TEXT", mode, text }` with retries if the worker is cold.  
5. Background validates sender, mode, text length, API key, and model allowlist.  
6. Background `POST`s to `https://api.x.ai/v1/chat/completions` with a mode-specific system prompt.  
7. Model returns structured JSON (source language, corrected/translated text, issues). Background validates response size and shape, clamps issue fields, and returns the model id used.
8. Content script renders the result panel (DOM nodes only) and offers Copy / Replace / Redo / optional one-shot Grok 4.5 (including after Translate to EN).

Optional: result-panel **Redo** re-sends the same text/mode. **Grok 4.5** sends the same request with `{ model: "grok-4.5" }` for one request only (saved popup model is unchanged). Background still allowlists the override.

Checks use xAI JSON mode. Leading/trailing selection whitespace is kept outside the model request and restored around the result. Active requests are tracked per tab/frame, so a new check only cancels an older request from the same content-script scope.

### Messaging resilience (1.1.1+)

| Situation | Behavior |
|-----------|----------|
| Service worker asleep | `PING` + retries on `CHECK_TEXT` |
| Extension reloaded while tab open | Detect *context invalidated*; show **Refresh page** |
| No receiver briefly | Retry with short backoff |

## Modes

| Mode | Prompt intent |
|------|----------------|
| `grammar` | Spelling, grammar, punctuation, diacritics only |
| `style` | Grammar + clarity, flow, word choice (same meaning) |
| `translate` | Translate the selection into English; `corrected` is the English text |

Language is **auto-detected** by the model (English, Czech, Slovak, and others). `translate` reports the source language and writes English into `corrected`.

## Replace strategy (1.1.2+)

| Target | Strategy |
|--------|----------|
| `input` / `textarea` | `setRangeText` or `before + corrected + after` using stored offsets; fire `input`/`change` |
| `contenteditable` | Prefer `document.execCommand("insertText")` over restored `Range`; fallback Range API with **verification**; restore original if insert fails |
| Failure | Return false → UI may copy instead of claiming a bad replace |

**Invariant:** never delete the selected range unless the correction is successfully inserted (or original is restored).

## Permissions

```json
"permissions": ["storage"],
"host_permissions": ["https://api.x.ai/*"]
```

- `storage` — save API key and model preference locally  
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

- Trusted message senders only (`chrome.runtime.id`)  
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
| `manifest.json` | MV3 entry points, permissions, content scripts (**v1.1.5**) |
| `background.js` | Grammar/style/translation prompts, fetch, response validation, settings, `PING` / `CHECK_TEXT` / `TEST_KEY` |
| `content/content.js` | Selection UX (mouse + keyboard), three-action toolbar, Shadow DOM UI, messaging retries, replace / redo logic |
| `popup/popup.html` / `.js` / `.css` | Configure key & model |
| `icons/` | 16 / 48 / 128 PNG icons |
| `tests/background.test.js` | Regression tests for translation, validation, output limits, and request concurrency |

## Related docs

- [INSTALLATION.md](INSTALLATION.md)  
- [USAGE.md](USAGE.md)  
- [DEVELOPMENT.md](DEVELOPMENT.md)  
- [CHANGELOG.md](../CHANGELOG.md)  
