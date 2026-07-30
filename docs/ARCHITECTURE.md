# Architecture

Grammar Grok is a **Chrome Manifest V3** extension with three runtime parts.

```
┌─────────────────────┐     chrome.runtime      ┌──────────────────────┐
│  Content script     │ ────── sendMessage ────►│  Background worker   │
│  content/content.js │ ◄──── response ─────────│  background.js       │
│                     │                         │                      │
│  • text selection   │                         │  • read API key      │
│  • toolbar / panel  │                         │  • call xAI API      │
│  • copy / replace   │                         │  • parse JSON        │
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

1. User selects text on an `http(s)` page.  
2. Content script shows a **fixed top toolbar**: Grammar | Grammar + Style.  
3. On click, content script sends `{ type: "CHECK_TEXT", mode, text }` to the background.  
4. Background validates sender, mode, text length, API key, and model allowlist.  
5. Background `POST`s to `https://api.x.ai/v1/chat/completions` with a mode-specific system prompt.  
6. Model returns JSON (language, corrected text, issues). Background clamps fields.  
7. Content script renders the result panel (DOM nodes only) and offers Copy / Replace.

## Modes

| Mode | Prompt intent |
|------|----------------|
| `grammar` | Spelling, grammar, punctuation, diacritics only |
| `style` | Grammar + clarity, flow, word choice (same meaning) |

Language is **auto-detected** by the model (English, Czech, Slovak, and others).

## Permissions

```json
"permissions": ["storage"],
"host_permissions": ["https://api.x.ai/*"]
```

- `storage` — save API key and model preference locally  
- `host_permissions` — only xAI API (not arbitrary sites)

Content scripts match `http://*/*` and `https://*/*`, excluding the Chrome Web Store.

## Security controls (summary)

- Trusted message senders only (`chrome.runtime.id`)  
- Model allowlist  
- Request timeout / abort of overlapping checks  
- Light client-side rate spacing  
- Error messages scrubbed of key-like patterns  
- No remote scripts; MV3 CSP on extension pages  

See also [SECURITY.md](../SECURITY.md).

## File reference

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 entry points, permissions, content scripts |
| `background.js` | Prompts, fetch, parse, settings |
| `content/content.js` | Selection UX, Shadow DOM UI, replace logic |
| `popup/popup.html` / `.js` / `.css` | Configure key & model |
| `icons/` | 16 / 48 / 128 PNG icons |
