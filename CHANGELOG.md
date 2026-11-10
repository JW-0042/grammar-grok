# Changelog

All notable changes to **Grammar Grok** are documented here.  
The version in [`manifest.json`](manifest.json) is the source of truth.

Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [1.3.2] — 2026-11-10

### Fixed

- **Replace could overwrite the wrong text.** If you selected other text while a result was open, Replace and Replace by typing acted on that new selection. They now always act on the text that was checked.
- **Emoticons were damaged by the text check.** `;)`, `;-)` and similar are no longer treated as semicolons.
- **Your own words were reported as AI wording** when you typed them without diacritics ("v dnesnej dobe") or with a typo ("furthremore"). The check now compares without diacritics and forgives small typos.
- **Punctuation fallback:** number ranges keep a hyphen (9-17), short items separated by semicolons become a comma list, mixed-case words such as iPhone are not capitalised, and quotations you wrote yourself, Windows paths and Unix paths are left untouched.
- **Replace by typing is limited to 2500 characters.** Longer texts could be cut off when Chrome stops the service worker after about five minutes. The panel now says so and suggests Replace.
- The panel no longer says "Suggestions" when the result equals your text, and the text check line names what Grok actually reworked.

### Changed

- A repair request is kept only when it reduces the reported problems.
- Invisible characters in `background.js` are written as `\u` escapes, guarded by a test.

## [1.3.1] — 2026-11-09

### Changed

- Typing is now its own button. The result panel shows **Replace** (one-step replacement, as before 1.3.0) and **Replace by typing** (types the result key by key like a person). Replace by typing never falls back to a paste: if the original text cannot be found again, the panel says so.
- The popup switch "Replace by typing like a human" is gone. The popup's How to use section explains both buttons instead, and the old setting is removed from storage.

## [1.3.0] — 2026-11-09

### Added

- **Replace by typing like a human** (on by default, switch in the popup). Replace selects the original text again and types the correction over it with real key events through `chrome.debugger`, with human-like pauses between keys, so the site sees normal typing instead of a paste. Enter creates new lines, emoji are inserted like keyboard input. Clicking anywhere on the page or pressing Escape stops typing. Ctrl+Z undoes it.
- While typing, Chrome shows its "started debugging this browser" bar. Clicking Cancel there also stops typing.
- When typing is off or the field cannot be selected again, Replace falls back to the previous one-step replacement.

### Changed

- New required `debugger` permission (Chrome does not allow it as an optional permission). The extension only attaches to the current tab while it types a Replace, and only uses the `Input` domain.

## [1.2.0] — 2026-11-09

### Added

- Automatic text check on every result. Characters that people rarely type and the author did not use (typographic quotes and apostrophes, the ellipsis character, en dashes, non-breaking and invisible spaces, Markdown bold) are converted back to plain keyboard characters. Em dashes, semicolons, added emoji, arrows or bullets, and stock AI words or phrases (English, Slovak, Czech) that the original does not use trigger one automatic repair request. Any em dashes or semicolons still left after that are replaced mechanically. Code, URLs, e-mail addresses, and HTML entities are never changed.
- The result panel shows what the text check fixed and anything left to review.
- Live preview: results stream into the panel while Grok is writing. Closing the panel or pressing Escape cancels the request.
- GitHub Actions workflow runs syntax checks and the regression tests on every push and pull request.

### Changed

- All three modes, including Translate to EN, ask for plain everyday writing. The model must not introduce words or constructions more complex or formal than the original uses. Words the author already used may stay.

### Security

- Password fields are never read or sent.
- Toolbar and panel buttons react only to real user clicks, so page scripts cannot trigger API requests.
- Only the popup may run the key test. Streaming connections are accepted only from this extension's content scripts.
- The service worker restricts `chrome.storage.local` to trusted extension contexts where Chrome supports it.

## [1.1.8] — 2026-10-04

### Changed

- Grammar and Grammar + Style now request natural everyday wording without stock AI phrases, filler, or unnecessary formality. Necessary specialist terminology and the author's meaning are preserved.
- Both correction modes replace em dashes and semicolons in prose with suitable punctuation or minimal sentence adjustments. Literal code, URLs, and verbatim quotations are preserved.
- Grammar applies these rules with minimal edits. Translate to EN keeps its existing rules.

## [1.1.7] — 2026-09-22

### Added

- Popup model choices **grok-4.7** and **grok-4.6**. Both are public xAI chat models. Requests for **grok-4.5**, **grok-4.6**, and **grok-4.7** set `reasoning_effort` to `low`, because their API default is `high` and reasoning cannot be turned off. The one-shot Grok 4.5 button uses the same setting.

### Notes

- **Grok 4.7 Fast** is intentionally absent. xAI documents it as the same Grok 4.7 model on faster infrastructure, available only through Cursor and Grok Build, not on `api.x.ai`.
- The saved model and the one-shot **Grok 4.5** button are unchanged.
- The popup marks **grok-4.20 non-reasoning** as recommended. The empty-storage default remains `grok-4.5`.

## [1.1.6] — 2026-08-24

### Fixed

- After a successful Replace, the extension now collapses the live selection and discards its stored Range, so the next native edit command starts from clean editor state.
- Draft.js root-level carets (as used by X) are normalized into the nearest real text node immediately after Replace and once after editor reconciliation, keeping the inserted text editable without stealing focus back.
- X/Draft.js replacement now goes through Draft's own paste handler, which updates its immutable `EditorState` together with the DOM. The synthetic event carries only the generated replacement and requires no clipboard permission.
- Rich-text Replace no longer emits a duplicate synthetic `InputEvent` after Chrome's native `execCommand("insertText")` transaction. This fixes cases where **Ctrl/Cmd+X** replayed/pasted text instead of cutting the new selection.
- Stateful rich-text editors no longer receive direct DOM fallback mutations that can create visible but non-editable “ghost” text. If their native replacement fails, the extension safely falls back to Copy.
- Text inputs now receive one standards-aligned replacement `input` event instead of duplicate `input` plus premature `change` events.

## [1.1.5] — 2026-08-24

### Added

- Selection toolbar action **Translate to EN**: detect the source language and translate the selected text into English. Copy / Replace / Redo work the same as for grammar checks.

### Fixed

- Replace is offered only for writable inputs, textareas, and rich-text editors—not ordinary page text.
- Leading/trailing whitespace in a selection is preserved around corrected or translated text.
- Translation uses structured JSON output with a larger output budget and explicit size errors instead of silent truncation.
- Invalid/incomplete model responses show an error instead of the misleading **Already English** state.
- Concurrent checks are isolated per tab/frame; one tab no longer cancels another.

### Tests

- Added Node regression coverage for translation whitespace, invalid JSON, long output, and concurrent tabs.

### Docs

- Updated the README and all guides to describe the complete 1.1.5 feature set, data handling, response validation, and regression-test workflow.

## [1.1.4] — 2026-08-06

### Added

- Result panel actions: **Redo** (same check again with the saved popup model) and one-shot **Grok 4.5** recheck without changing the saved model.
- Result header shows the model that actually answered the request.

### Fixed

- Content script bootstrap no longer hard-crashes Chrome on some sites (e.g. recepty.cz with ad iframes). Host shell styles avoid fragile `style.cssText` assignment; Shadow DOM attach and host mount fail soft per frame.
- Toolbar also appears after **keyboard selection**, including **Ctrl+A / Cmd+A** (not only mouse drag).
- Result panel no longer shows nested scrollbars: corrected text expands to fit content; only the panel body scrolls, with dark-themed scrollbar styling.

### Docs

- Documentation aligned to **1.1.4**.

## [1.1.3] — 2026-08-06

### Note

- Intermediate local work was folded into **1.1.4** (bootstrap hardening, keyboard selection, redo actions, panel scroll polish).

## [1.1.2] — 2026-07-30

### Fixed

- **Partial selection Replace** no longer deletes the selected span without inserting the correction. Unselected text in the same field is preserved.
- Inputs/textareas use `setRangeText` (with value rebuild + event firing) for reliable partial replaces.
- Contenteditable replace prefers atomic `insertText`, verifies the result, and attempts to restore the original text if insert fails.

### Docs

- Documentation aligned to **1.1.2** (this release).

## [1.1.1] — 2026-07-30

### Fixed

- **“Extension context invalidated”** on long-lived SPA tabs (especially **X/Twitter** reply compose) after extension reload or cold service worker.
- Messaging retries with service-worker wake-up (`PING`) before checks.
- Clear error UI with **Refresh page** when the extension connection is dead.

### Changed

- Content scripts run in **`all_frames`** (nested composers / iframes).
- Better detection of `contenteditable` and `role="textbox"` (X compose).
- `match_about_blank` / `match_origin_as_fallback` for edge-frame cases.

## [1.1.0] — 2026-07-30

### Security & reliability

- Message sender checks (`chrome.runtime.id`).
- Model allowlist; API key shape checks; error scrubbing.
- Safer JSON parse (no free-form model prose as full replace).
- Field length clamps; fetch timeout / abort of overlapping checks.
- Result UI built with DOM text nodes (no untrusted `innerHTML` of model output).
- Content scripts limited to `http` / `https` (not `file://` / Chrome internals).

### UI

- Mode toolbar **fixed at top center** of the viewport (does not cover selection).
- Toolbar hides when selection is cleared (fixed `hidden` vs `display:flex` override).

### Docs / open source

- MIT license, full docs, CONTRIBUTING, SECURITY, issue templates.
- Public repository: https://github.com/JW-0042/grammar-grok

## [1.0.0] — 2026-07-30

### Added

- Initial Chrome MV3 extension: Grammar / Grammar + Style via xAI Chat Completions.
- Popup for API key and model.
- Selection toolbar, result panel, Copy / Replace.
- Language auto-detection via Grok prompts.

[1.3.2]: https://github.com/JW-0042/grammar-grok/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/JW-0042/grammar-grok/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/JW-0042/grammar-grok/compare/68bc477...v1.3.0
[1.2.0]: https://github.com/JW-0042/grammar-grok/compare/v1.1.8...68bc477
[1.1.8]: https://github.com/JW-0042/grammar-grok/compare/44b9d18...v1.1.8
[1.1.7]: https://github.com/JW-0042/grammar-grok/compare/af7ea43...44b9d18
[1.1.6]: https://github.com/JW-0042/grammar-grok/compare/f7ace21...af7ea43
[1.1.5]: https://github.com/JW-0042/grammar-grok/compare/v1.1.4...f7ace21
[1.1.4]: https://github.com/JW-0042/grammar-grok/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/JW-0042/grammar-grok/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/JW-0042/grammar-grok/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/JW-0042/grammar-grok/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/JW-0042/grammar-grok/releases/tag/v1.1.0
[1.0.0]: https://github.com/JW-0042/grammar-grok/releases/tag/v1.0.0
