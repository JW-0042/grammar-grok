# Usage guide

**Current version: 1.1.5**

## Everyday flow

1. Open any normal webpage (`https://…` or `http://…`).  
2. **Select** the text you want to check (at least 3 non-space characters).  
   You may select the **whole field** or only **part** of a sentence — with the mouse **or** keyboard (**Ctrl+A / Cmd+A**, Shift+arrows, etc.).  
3. A compact bar appears **fixed at the top center** of the window:
   - **Grammar** — fix mistakes only; keep your voice  
   - **Grammar + Style** — also improve clarity and flow  
   - **Translate to EN** — translate the selection into English
4. Wait for the result panel (right side).  
5. Read the language badge, summary, corrected text, and issue list.  
6. **Copy** the result, or **Replace** when the selection is in an editable field.

### Tips

- Scroll freely — the mode bar stays at the top of the **viewport** and does not cover your selection.  
- Clear the selection or click away → the mode bar **hides**.  
- Press **Escape** to close the toolbar and result panel.  
- Long results use **one** panel scrollbar; corrected text expands to its full height.  
- Languages such as English, Czech, Slovak (and many others) are **auto-detected**.

## Choosing a mode

| Mode | Use when |
|------|----------|
| Grammar | You want correctness only (spelling, agreement, punctuation, diacritics) |
| Grammar + Style | You also want smoother, clearer wording without changing meaning |
| Translate to EN | The selection is in another language and you want a fluent English version |

## Copy vs Replace

| Action | Behavior |
|--------|----------|
| **Copy** | Puts the full corrected text on the clipboard |
| **Replace** | Swaps **only the text you selected** with the correction. Text before/after the selection in the same box stays put (**1.1.2+**) |
| **Redo** | Runs the same check again with your **saved** popup model |
| **Grok 4.5** | One-time recheck with Grok 4.5 when the fast model result is not good enough (does **not** change your saved model) |

**Replace works best in:**

- `<input>` and `<textarea>`  
- Many `contenteditable` areas (`role="textbox"`, etc.)

**Replace may fail on:**

- Heavily scripted editors (some social compose boxes, collaborative docs)  
- Read-only page text (not an editor)

If Replace fails, the extension may copy the correction instead, or show an error — paste manually.

### Partial selection example

Field content: `Hello wrold, how are you?`  
You select only `wrold` → check → Replace →  
Result: `Hello world, how are you?`  
(The rest of the sentence is unchanged.)

## Settings (popup)

Click the extension icon:

| Setting | Description |
|---------|-------------|
| xAI API key | From [console.x.ai](https://console.x.ai). Stored only on this device. |
| Model | Default `grok-4.5`. Other allowlisted Grok models available. |
| Test connection | Small request to verify key + model. |

## Limits

- Max selection length: **8000** characters (cost and latency).  
- Checks only run when you click **Grammar** or **Grammar + Style** (nothing is sent while only selecting).

## X / Twitter and other SPAs

1. After installing or reloading the extension, **refresh the tab once**.  
2. Open Reply / compose, select text, use the top toolbar.  
3. If you see *Extension context invalidated*, click **Refresh page** in the error panel or press **F5**.

## Privacy in practice

- Nothing is sent until you press **Grammar** or **Grammar + Style**.  
- Only the selected text (plus the mode system prompt) goes to xAI.  
- No analytics; the project does not phone home to the authors.

## Keyboard / accessibility

- Toolbar and dialog use basic ARIA roles/labels.  
- Escape closes UI.  
- Further a11y improvements are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
