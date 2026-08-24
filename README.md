# Grammar Grok

**Proofread or translate text on any webpage with Grok** — select text, choose **Grammar**, **Grammar + Style**, or **Translate to EN**, and get a structured result with automatic source-language detection.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.5-purple.svg)](manifest.json)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3)

> **Open source (MIT).** Free to use, modify, and redistribute for any purpose — including commercial — **provided you keep the copyright notice and license** so the original project is attributed. See [LICENSE](LICENSE).

**Current release: [1.1.5](CHANGELOG.md)** — Translate to EN, Redo / Grok 4.5, keyboard select-all, single-scrollbar result panel.

---

## Features

- **Select-to-check** on almost any `http` / `https` page (including nested frames) — mouse or keyboard (**Ctrl+A**)  
- Three actions:
  - **Grammar** — spelling, grammar, punctuation, diacritics  
  - **Grammar + Style** — also clarity, flow, and word choice  
  - **Translate to EN** — translate any selected language into English
- **Auto language detection** (EN, CS, SK, …)  
- Toolbar **fixed at the top** of the viewport (does not cover your selection)  
- Hides automatically when nothing is selected  
- **Copy** or **Replace** — Replace updates **only the selected span**; surrounding text stays (**1.1.2+**)  
- **Redo** the same check, or one-shot **Grok 4.5** quality recheck from the result panel (**1.1.4+**)  
- Works with inputs, textareas, and many contenteditable / `role="textbox"` editors  
- API key stays in the **background worker** only — never injected into web pages  
- Resilient messaging after MV3 service-worker sleep or extension reload (**1.1.1+**)

## Screenshots (what to expect)

1. Select text → top bar: `Grammar` | `Grammar + Style` | `Translate to EN`
2. Result panel: language/model badges, corrected or translated text, issue list, Copy / Replace / Redo / Grok 4.5

*(UI is dark, compact, and isolated via Shadow DOM so site CSS cannot restyle it easily.)*

## Quick start

### 1. Get an xAI API key

1. Create a key at **[console.x.ai](https://console.x.ai)**  
2. API usage is billed by xAI  

**Note:** SuperGrok / grok.com **chat login cannot** power this extension. There is no third-party OAuth for consumer Grok chat. You need an API key.

### 2. Install the extension

```bash
git clone https://github.com/JW-0042/grammar-grok.git
cd grammar-grok
```

1. Open `chrome://extensions`  
2. Enable **Developer mode**  
3. **Load unpacked** → choose this repository folder  
4. Confirm version **1.1.5** on the extension card
5. Open the extension popup → paste API key → **Save**  
6. Optional: **Test connection**

Full steps: **[docs/INSTALLATION.md](docs/INSTALLATION.md)**

### 3. Use it

1. Select text on a webpage (full field or **part** of a sentence)  
2. Click **Grammar**, **Grammar + Style**, or **Translate to EN**
3. **Copy** or **Replace** the corrected or translated result

Details: **[docs/USAGE.md](docs/USAGE.md)**

> After every extension **Reload**, hard-refresh open tabs (especially x.com). Otherwise Chrome keeps a dead content script and you may see *Extension context invalidated*.

---

## Documentation

| Document | Contents |
|----------|----------|
| [CHANGELOG.md](CHANGELOG.md) | Version history (1.0.0 → **1.1.5**) |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Install, update, uninstall, troubleshooting |
| [docs/USAGE.md](docs/USAGE.md) | Everyday use, proofreading, translation, partial Replace, SPAs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, messaging, replace strategy, permissions |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local dev, constants, test checklist, release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting & data handling |
| [LICENSE](LICENSE) | MIT license text |

---

## Project layout

```
grammar-grok/
├── manifest.json          # Chrome MV3 manifest (v1.1.5)
├── background.js          # Service worker: xAI API, validation, prompts, PING
├── content/
│   └── content.js         # Selection toolbar, result panel, replace, retries
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   └── background.test.js # Background regression tests
├── docs/                  # Full documentation
├── CHANGELOG.md
├── LICENSE                # MIT
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

No build step and no `npm` dependencies — load the folder as an unpacked extension.

---

## Privacy & security

| Topic | Behavior |
|-------|----------|
| API key | Stored in `chrome.storage.local` on **your** machine only |
| Selected text | Sent to `https://api.x.ai` **only when you choose** Grammar, Grammar + Style, or Translate to EN |
| Analytics | **None** |
| Host access | Only `https://api.x.ai/*` |
| Repo secrets | **No API keys or personal data** are shipped in this repository |

More: [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Configuration

| Setting | Default | Notes |
|---------|---------|--------|
| Model | `grok-4.5` | Change in popup; allowlisted models only |
| Max selection | 8000 chars | Enforced in background + content script |
| Actions | `grammar` / `style` / `translate` | System prompts in `background.js` |

---

## Recent fixes (summary)

| Version | Highlights |
|---------|------------|
| **1.1.5** | Translate to EN; safer Replace; whitespace preservation; validated structured output; per-tab/frame concurrency; regression tests |
| **1.1.4** | Ctrl+A toolbar, Redo / Grok 4.5, single-scrollbar result panel, safer bootstrap |
| **1.1.3** | Content-script bootstrap crash on some sites/ad frames |
| **1.1.2** | Partial-selection Replace preserves surrounding text; safer contenteditable replace |
| **1.1.1** | X/Twitter compose / context invalidated recovery; `all_frames`; messaging retries |
| **1.1.0** | Security hardening; top-fixed toolbar; open-source release |
| **1.0.0** | Initial public feature set |

Full notes: **[CHANGELOG.md](CHANGELOG.md)**

---

## Contributing

Contributions are welcome — code, docs, translations, UX.

1. Fork → branch → PR (see [CONTRIBUTING.md](CONTRIBUTING.md))  
2. Never commit API keys or `.env` files  
3. Keep attribution: MIT requires the copyright and license notice in redistributions  

---

## License

[MIT](LICENSE) © 2026 [JW-0042](https://github.com/JW-0042)

You may use this software for **any purpose** (personal, education, commercial), free of charge, as long as you **include the copyright notice and license** (i.e. mention the original contribution). The software is provided **as is**, without warranty.

---

## Disclaimer

Grammar Grok is an independent open-source project. It is **not** affiliated with, endorsed by, or sponsored by xAI or the Grok product team. “Grok” and related marks belong to their respective owners. You are solely responsible for API usage, costs, and compliance with xAI’s terms.
