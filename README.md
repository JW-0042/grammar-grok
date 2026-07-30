# Grammar Grok

**Proofread any webpage with Grok** — select text, pick **Grammar** or **Grammar + Style**, get corrections with automatic language detection (English, Czech, Slovak, and more).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.2-purple.svg)](manifest.json)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3)

> **Open source (MIT).** Free to use, modify, and redistribute for any purpose — including commercial — **provided you keep the copyright notice and license** so the original project is attributed. See [LICENSE](LICENSE).

---

## Features

- **Select-to-check** on almost any `http` / `https` page  
- Two modes:
  - **Grammar** — spelling, grammar, punctuation, diacritics  
  - **Grammar + Style** — also clarity, flow, and word choice  
- **Auto language detection** (EN, CS, SK, …)  
- Toolbar **fixed at the top** of the viewport (does not cover your selection)  
- Hides automatically when nothing is selected  
- **Copy** or **Replace** corrected text (inputs, textareas, contenteditable)  
- API key stays in the **background worker** only — never injected into web pages  

## Screenshots (what to expect)

1. Select text → top bar: `Grammar` | `Grammar + Style`  
2. Result panel: language badge, corrected text, issue list, Copy / Replace  

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
4. Open the extension popup → paste API key → **Save**  
5. Optional: **Test connection**

Full steps: **[docs/INSTALLATION.md](docs/INSTALLATION.md)**

### 3. Use it

1. Select text on a webpage  
2. Click **Grammar** or **Grammar + Style**  
3. Copy or replace the result  

Details: **[docs/USAGE.md](docs/USAGE.md)**

---

## Documentation

| Document | Contents |
|----------|----------|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Install, update, uninstall, troubleshooting |
| [docs/USAGE.md](docs/USAGE.md) | Everyday use, modes, limits, privacy tips |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, permissions |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local dev, constants, release checklist |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting & data handling |
| [LICENSE](LICENSE) | MIT license text |

---

## Project layout

```
grammar-grok/
├── manifest.json          # Chrome MV3 manifest (v1.1.2)
├── background.js          # Service worker: xAI API, validation, prompts
├── content/
│   └── content.js         # Selection toolbar + result panel (Shadow DOM)
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── docs/                  # Full documentation
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
| Selected text | Sent to `https://api.x.ai` **only when you click** a check button |
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
| Modes | `grammar` / `style` | System prompts in `background.js` |

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
