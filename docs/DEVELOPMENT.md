# Development

## Stack

- Vanilla JavaScript (no build step)  
- Chrome Extension Manifest V3  
- xAI OpenAI-compatible Chat Completions API  

No `npm install` is required to run or load the extension.

## Local workflow

1. Load unpacked (see [INSTALLATION.md](INSTALLATION.md)).  
2. Edit files.  
3. Reload the extension on `chrome://extensions`.  
4. Hard-refresh the test page so the content script re-injects.

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

Content script: `MIN_LEN`, `MAX_SEND_CHARS` in `content/content.js`.

When adding a model, update **both** `background.js` and `popup/popup.js` / `popup.html` allowlists.

## Versioning

Use semantic versioning in `manifest.json`:

- **Patch** `1.1.x` — fixes, docs  
- **Minor** `1.x.0` — features, hardening  
- **Major** `x.0.0` — breaking behavior / permissions changes  

## Testing checklist

- [ ] Select text → toolbar at top center  
- [ ] Deselect → toolbar disappears  
- [ ] Grammar mode returns JSON UI  
- [ ] Style mode differs in prompt behavior  
- [ ] EN / CS / SK sample sentences  
- [ ] Missing API key shows clear error  
- [ ] Test connection in popup  
- [ ] Copy works  
- [ ] Replace works in `<textarea>` / contenteditable  
- [ ] Escape closes UI  
- [ ] No API key string appears in repo (`git grep` / review)

## Releasing

1. Bump `version` in `manifest.json` and README badge/version line.  
2. Update docs if behavior changed.  
3. Commit, tag optional: `git tag v1.1.0`.  
4. Push to GitHub.

There is no automated CI in the base project; add Actions later if you want lint checks.
