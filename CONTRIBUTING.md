# Contributing to Grammar Grok

Thanks for helping improve Grammar Grok. Contributions of all kinds are welcome: bug fixes, features, docs, translations, and UX polish.

## License & attribution

By contributing, you agree that your contributions are licensed under the **MIT License** (see [LICENSE](LICENSE)).

If you use or redistribute this project (or a substantial portion of it), you **must keep the copyright notice and license** so the original contribution is attributed — as required by MIT.

## Development setup

1. Fork the repository and clone your fork.  
2. Open Chrome → `chrome://extensions` → enable **Developer mode**.  
3. **Load unpacked** → select the project root (folder that contains `manifest.json`).  
4. After code changes, click **Reload** on the extension card, then hard-refresh open tabs (`Ctrl+Shift+R` / `Cmd+Shift+R`).

You need your own free/paid **xAI API key** from [console.x.ai](https://console.x.ai) for live tests. **Never commit your key.**

## Project map

| Path | Role |
|------|------|
| `manifest.json` | Chrome MV3 manifest |
| `background.js` | Service worker: settings, xAI API, validation |
| `content/content.js` | Selection UI (toolbar + result panel) |
| `popup/` | Settings popup (API key, model) |
| `icons/` | Extension icons |
| `docs/` | Extra documentation |

## Coding guidelines

- Keep the API key **only** in the background worker / `chrome.storage.local`.  
- Prefer DOM APIs + `textContent` over `innerHTML` for untrusted model output.  
- Validate messages and clamp string lengths for API responses.  
- Match existing style: small focused files, clear comments where non-obvious.  
- Do not add analytics, remote code, or broad host permissions without discussion.  
- Bump `version` in `manifest.json` for user-visible releases (semver).

## Pull requests

1. Create a branch: `fix/…`, `fix/…`, or `docs/…`.  
2. Make focused commits with clear messages.  
3. Open a PR against `main` describing:
   - What changed and why  
   - How you tested (browser, pages, modes)  
4. Keep PRs reasonably small when possible.

## Issues

- Use a clear title and reproduction steps.  
- Note browser version and OS.  
- For security issues, follow [SECURITY.md](SECURITY.md) instead of a public bug report.

## Code of conduct (short)

Be respectful. Assume good intent. No harassment or spam. Maintainers may close issues/PRs that violate this.
