# Changelog

All notable changes to **Grammar Grok** are documented here.  
The version in [`manifest.json`](manifest.json) is the source of truth.

Format inspired by [Keep a Changelog](https://keepachangelog.com/).

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

[1.1.5]: https://github.com/JW-0042/grammar-grok/compare/v1.1.4...HEAD
[1.1.4]: https://github.com/JW-0042/grammar-grok/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/JW-0042/grammar-grok/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/JW-0042/grammar-grok/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/JW-0042/grammar-grok/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/JW-0042/grammar-grok/releases/tag/v1.1.0
[1.0.0]: https://github.com/JW-0042/grammar-grok/releases/tag/v1.0.0
