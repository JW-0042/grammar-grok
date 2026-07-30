# Development

**Current version: 1.1.2**

## Stack

- Vanilla JavaScript (no build step)  
- Chrome Extension Manifest V3  
- xAI OpenAI-compatible Chat Completions API  

No `npm install` is required to run or load the extension.

## Local workflow

1. Load unpacked (see [INSTALLATION.md](INSTALLATION.md)).  
2. Edit files.  
3. Reload the extension on `chrome://extensions`.  
4. **Hard-refresh the test page** so the content script re-injects (required after every extension reload).

### Background worker logs

`chrome://extensions` → Grammar Grok → **Service worker** link → DevTools console.

### Content script logs

Page DevTools → Console (content script context). Note: the UI lives in a **closed** Shadow DOM.

### Popup

Right-click the extension icon → **Inspect popup**.

## Configuration constants

Important knobs live at the top of `background.js`:

| Constant | Meaning |
|----------|---------|
| `DEFAULT_MODEL` | Fallback model id |
| `ALLOWED_MODELS` | Models the user may select |
| `MAX_CHARS` | Max selection length |
| `FETCH_TIMEOUT_MS` | API timeout |
| `MIN_REQUEST_GAP_MS` | Spacing between checks |

Content script (`content/content.js`):

| Constant | Meaning |
|----------|---------|
| `MIN_LEN` | Minimum selection length to show toolbar |
| `MAX_SEND_CHARS` | Client-side max before calling background |
| `MSG_RETRIES` | Retries for cold service worker / no receiver |

When adding a model, update **both** `background.js` and `popup/popup.js` / `popup.html` allowlists.

## Versioning

Use semantic versioning in `manifest.json`:

- **Patch** `1.1.x` — fixes, docs  
- **Minor** `1.x.0` — features, hardening  
- **Major** `x.0.0` — breaking behavior / permissions changes  

Keep these in sync when releasing:

1. `manifest.json` → `version`  
2. [CHANGELOG.md](../CHANGELOG.md)  
3. README version badge  
4. “Current version” lines in `docs/*`  

## Testing checklist

- [ ] Select text → toolbar at **top center**  
- [ ] Deselect / click away → toolbar **disappears**  
- [ ] Grammar mode returns structured UI  
- [ ] Style mode differs in prompt behavior  
- [ ] EN / CS / SK sample sentences  
- [ ] Missing API key shows clear error  
- [ ] Test connection in popup  
- [ ] **Copy** works  
- [ ] **Replace full** field contents in `<textarea>`  
- [ ] **Replace partial** selection mid-sentence (surrounding text preserved) — critical since **1.1.2**  
- [ ] Contenteditable / `role="textbox"` (e.g. X compose) after **page refresh**  
- [ ] After extension Reload, without page refresh: friendly context error + Refresh button (**1.1.1+**)  
- [ ] Escape closes UI  
- [ ] No API key string in repo  

## Releasing

1. Bump `version` in `manifest.json`.  
2. Update [CHANGELOG.md](../CHANGELOG.md), README badge, and docs “Current version” lines.  
3. Commit, optional tag: `git tag v1.1.2 && git push origin v1.1.2`.  
4. Push `main` to GitHub: https://github.com/JW-0042/grammar-grok  

There is no automated CI in the base project; add Actions later if you want lint checks.

## Architecture reference

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, permissions, replace strategy, and messaging.
