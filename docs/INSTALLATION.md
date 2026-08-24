# Installation

**Current version: 1.1.6** (see [`manifest.json`](../manifest.json) and [CHANGELOG.md](../CHANGELOG.md)).

## Requirements

- Google Chrome or another Chromium browser that supports **Manifest V3** extensions  
- An **xAI API key** from [console.x.ai](https://console.x.ai)  
  - API usage is billed by xAI  
  - A SuperGrok / grok.com chat subscription is **not** enough by itself (no third-party OAuth for consumer chat)

## Install from GitHub (unpacked)

1. Clone or download this repository:

   ```bash
   git clone https://github.com/JW-0042/grammar-grok.git
   cd grammar-grok
   ```

   Or use **Code → Download ZIP** and unpack it.

2. Open the extensions page:
   - Chrome: `chrome://extensions`  
   - Edge: `edge://extensions`

3. Enable **Developer mode** (toggle, usually top-right).

4. Click **Load unpacked** and select the project folder that contains `manifest.json`.

5. Confirm the card shows **Grammar Grok** version **1.1.6**.

6. Pin **Grammar Grok** to the toolbar (puzzle icon → pin).

7. Click the extension icon → paste your API key → **Save**.  
   Optionally click **Test connection**.

## Update to the latest version

```bash
cd grammar-grok
git pull
```

Then:

1. `chrome://extensions` → **Reload** on Grammar Grok  
2. **Hard-refresh every open tab** you care about (`F5` or `Ctrl+Shift+R`)  

After any extension reload, long-lived SPAs (X/Twitter, Gmail, etc.) **must** be refreshed once so the content script reconnects. Otherwise you may see *Extension context invalidated*.

## Uninstall

On `chrome://extensions`, remove **Grammar Grok**.  
This deletes extension storage on that profile (including the saved API key).

## Optional: pack for yourself

Chrome can **Pack extension** for a private `.crx`. That is optional and not required for development.  
Do **not** commit `.pem` private keys used for packing (see `.gitignore`).

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Toolbar never appears | Select ≥ 3 characters; reload extension + hard-refresh page; page must be `http`/`https` (not PDF-only or `chrome://`) |
| “No API key set” | Open popup, paste key, **Save** |
| API / HTTP errors | Check key and credits on [console.x.ai](https://console.x.ai); try **Test connection** |
| Replace does nothing | Some sites block scripted edits; use **Copy** and paste. Prefer ≥ **1.1.2** for partial selections |
| Partial Replace deleted selection, left no correction | Upgrade to **≥ 1.1.2**, reload extension, refresh the page |
| Toolbar stuck always visible | Use **≥ 1.1.0** (fixed `hidden` vs `display:flex`); reload + refresh |
| “Extension context invalidated” (X/Twitter reply, etc.) | Reload extension **then F5** the tab. **≥ 1.1.1** retries messaging and offers **Refresh page** |
| X/Twitter compose modal | Use **≥ 1.1.1** (`all_frames` + contenteditable / `role=textbox`). After updates, refresh x.com once |
| Connection lost after updating extension | Always refresh open tabs after Reload on `chrome://extensions` |

More usage detail: [USAGE.md](USAGE.md).  
Release history: [CHANGELOG.md](../CHANGELOG.md).
