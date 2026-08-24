# Development

**Current version: 1.1.5**

## Stack

- Vanilla JavaScript (no build step)  
- Chrome Extension Manifest V3  
- xAI OpenAI-compatible Chat Completions API  

No `npm install` is required to run or load the extension.

Run the background regression tests with:

```bash
node --test tests/background.test.js
```

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
| `MAX_TRANSLATED_CHARS` | Max accepted translated/corrected output length |
| `MAX_RESPONSE_CHARS` | Max raw API response size |
| `DEFAULT_MAX_TOKENS` | Grammar/style output-token budget |
| `TRANSLATE_MAX_TOKENS` | Translation output-token budget |
| `FETCH_TIMEOUT_MS` | API timeout |
| `MIN_REQUEST_GAP_MS` | Spacing between checks |

Content script (`content/content.js`):

| Constant | Meaning |
|----------|---------|
| `MIN_LEN` | Minimum selection length to show toolbar |
| `MAX_SEND_CHARS` | Client-side max before calling background |
| `MSG_RETRIES` | Retries for cold service worker / no receiver |
| `QUALITY_MODEL` | One-shot quality recheck target (`grok-4.5`) |

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
- [ ] **Ctrl+A / Cmd+A** also shows the toolbar  
- [ ] Result panel **Redo** re-runs with saved model  
- [ ] Result panel **Grok 4.5** one-shot recheck (saved model unchanged)  
- [ ] Result panel has a **single** scrollbar (no nested textarea scrollbar)  
- [ ] Deselect / click away → toolbar **disappears**  
- [ ] Grammar mode returns structured UI  
- [ ] **Translate to EN** returns English text; source language badge; Replace inserts translation
- [ ] Leading/trailing whitespace survives Copy / Replace
- [ ] Read-only page text does not offer Replace
- [ ] Invalid/truncated JSON shows an error (never **Already English**)
- [ ] Concurrent checks in two tabs both complete
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
3. Commit, then optionally tag the release (for example, `git tag v1.1.5 && git push origin v1.1.5`).
4. Push `main` to GitHub: https://github.com/JW-0042/grammar-grok  

The repository includes local Node regression tests but no automated CI yet; add GitHub Actions later if you want checks on every push.

## Architecture reference

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, permissions, replace strategy, and messaging.
