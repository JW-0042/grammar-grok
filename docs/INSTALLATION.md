# Installation

## Requirements

- Google Chrome or another Chromium browser that supports Manifest V3 extensions  
- An **xAI API key** from [console.x.ai](https://console.x.ai)  
  - API usage is billed by xAI  
  - A SuperGrok / grok.com chat subscription is **not** enough by itself (no third-party OAuth)

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

5. Pin **Grammar Grok** to the toolbar (puzzle icon → pin).

6. Click the extension icon → paste your API key → **Save**.  
   Optionally click **Test connection**.

## Update

```bash
git pull
```

Then on `chrome://extensions` click **Reload** for Grammar Grok, and hard-refresh any open tabs.

## Uninstall

On `chrome://extensions`, remove **Grammar Grok**.  
This deletes extension storage on that profile (including the saved API key).

## Optional: pack for yourself

Chrome can **Pack extension** for a private `.crx`. That is optional and not required for development.  
Do **not** commit `.pem` private keys used for packing.

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Toolbar never appears | Select ≥ 3 characters; reload extension + hard-refresh page; ensure page is `http`/`https` (not PDF-only or `chrome://`) |
| “No API key set” | Open popup, paste key, Save |
| API / HTTP errors | Check key and credits on [console.x.ai](https://console.x.ai); try **Test connection** |
| Replace does nothing | Some sites block edits; use **Copy** and paste manually |
| Toolbar stuck visible | Upgrade to ≥ 1.1.0; reload extension (fixed `hidden` vs `display:flex`) |
