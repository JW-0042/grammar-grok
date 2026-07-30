# Usage guide

## Everyday flow

1. Open any normal webpage (`https://…` or `http://…`).  
2. **Select** the text you want to check (at least 3 non-space characters).  
3. A compact bar appears **fixed at the top center** of the window:
   - **Grammar** — fix mistakes only; keep your voice  
   - **Grammar + Style** — also improve clarity and flow  
4. Wait for the result panel (right side).  
5. Read the language badge, summary, corrected text, and issue list.  
6. **Copy** the result, or **Replace** when the selection is in an input, textarea, or contenteditable field.

### Tips

- Scroll the page freely — the mode bar stays at the top of the **viewport**.  
- Clear the selection or click away → the mode bar **hides**.  
- Press **Escape** to close the toolbar and result panel.  
- Works well for English, Czech, Slovak, and many other languages (auto-detected).

## Choosing a mode

| Mode | Use when |
|------|----------|
| Grammar | You want correctness only (spelling, agreement, punctuation, diacritics) |
| Grammar + Style | You also want smoother, clearer wording without changing meaning |

## Settings (popup)

Click the extension icon:

| Setting | Description |
|---------|-------------|
| xAI API key | From [console.x.ai](https://console.x.ai). Stored only on this device. |
| Model | Default `grok-4.5`. You can pick other allowlisted Grok models. |
| Test connection | Small request to verify key + model. |

## Limits

- Max selection length: **8000** characters (keeps cost and latency reasonable).  
- Very large pages or special editors (e.g. some collaborative docs) may not support **Replace**; use **Copy**.

## Privacy in practice

- Nothing is sent until you press **Grammar** or **Grammar + Style**.  
- Only the selected text (and the system prompt for that mode) go to xAI.  
- This project does not run analytics or phone home to the authors.

## Keyboard / accessibility notes

- Toolbar and dialog use basic ARIA roles/labels.  
- Escape closes UI.  
- Further a11y improvements are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
