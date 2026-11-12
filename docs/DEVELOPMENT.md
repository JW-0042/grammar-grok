# Development

**Current version: 1.4.0**

## Stack

- Vanilla JavaScript (no build step)  
- Chrome Extension Manifest V3  
- xAI OpenAI-compatible Chat Completions API  

No `npm install` is required to run or load the extension.

Run the regression tests with:

```bash
node --test tests/*.test.js
```

GitHub Actions ([`.github/workflows/test.yml`](../.github/workflows/test.yml)) runs the same tests plus `node --check` on every push to `main` and on pull requests. `tests/release.test.js` fails when the manifest version and the docs disagree.

## Local workflow

1. Load unpacked (see [INSTALLATION.md](INSTALLATION.md)).  
2. Edit files.  
3. Reload the extension on `chrome://extensions`.  
4. **Hard-refresh the test page** so the content script re-injects (required after every extension reload).

### Background worker logs

`chrome://extensions` → Grammar Grok → **Service worker** link → DevTools console.

### Content script logs

Page DevTools → Console (content script context). Note: the UI lives in a **closed** Shadow DOM.

The injected host exposes only a diagnostic `data-grammar-grok-version` attribute, which helps confirm that a refreshed tab is running the expected unpacked build.

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

`grok-4.5`, `grok-4.6`, and `grok-4.7` are public chat models. Requests for those three set `reasoning_effort` to `low`, because their API default is `high` and reasoning cannot be disabled. The popup text marks `grok-4.20-0309-non-reasoning` as recommended; keep `DEFAULT_MODEL` as `grok-4.5` unless that fallback is changed on purpose. Do not add Grok 4.7 Fast: xAI documents it as Cursor and Grok Build only, not `api.x.ai`.

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
- [ ] **Translate to EN / CZ** return text in that language; source language badge; Replace inserts translation  
- [ ] **Quick check** shows the skipped-check note and makes one request  
- [ ] **Translate result to** chips translate the result; Replace still targets the original selection  
- [ ] Popup: toggling toolbar buttons and languages changes the bar after selecting text again
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
- [ ] After Replace, make a new selection and press **Ctrl/Cmd+X** → text is cut, never pasted or replayed
- [ ] Replaced rich-editor text remains immediately editable; failed stateful-editor replacement falls back to Copy, never “ghost” DOM
- [ ] X/Draft.js caret after Replace is inside its text block, not on the outer `role="textbox"` element
- [ ] X/Draft.js DOM text and immutable editor state stay synchronized after Replace and immediate typing
- [ ] Contenteditable / `role="textbox"` (e.g. X compose) after **page refresh**  
- [ ] After extension Reload, without page refresh: friendly context error + Refresh button (**1.1.1+**)  
- [ ] Escape closes UI and cancels a running check  
- [ ] Result streams into the panel while Grok writes; the text check note appears under the corrected text  
- [ ] Selecting text in a password field never shows the toolbar  
- [ ] **Replace by typing**: the original span is selected again and the correction is typed over it; works in `<textarea>`, plain `contenteditable`, and X; a click or Escape stops it; Chrome's debugging bar disappears afterwards  
- [ ] **Replace**: one-step replacement, no debugging bar  
- [ ] Select other text while a result is open, then Replace: only the originally checked text changes (**1.3.2**)  
- [ ] Text with `;)` keeps the emoticon  
- [ ] No API key string in repo  

## Releasing

1. Bump `version` in `manifest.json`.  
2. Update [CHANGELOG.md](../CHANGELOG.md), README badge, and docs “Current version” lines.  
3. Commit, then optionally tag the release (for example, `git tag vX.Y.Z && git push origin vX.Y.Z`).
4. Push `main` to GitHub: https://github.com/JW-0042/grammar-grok  

CI must be green before tagging a release.

## Architecture reference

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, permissions, replace strategy, and messaging.
