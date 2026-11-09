# Usage guide

**Current version: 1.2.0**

## Everyday flow

1. Open any normal webpage (`https://…` or `http://…`).  
2. **Select** the text you want to check (at least 3 non-space characters).  
   You may select the **whole field** or only **part** of a sentence — with the mouse **or** keyboard (**Ctrl+A / Cmd+A**, Shift+arrows, etc.).  
3. A compact bar appears **fixed at the top center** of the window:
   - **Grammar** — fix mistakes and apply the wording rules below with minimal edits; keep your voice
   - **Grammar + Style** — also improve clarity and flow  
   - **Translate to EN** — translate the selection into English
4. Wait for the result panel (right side). The result appears there live while Grok writes it.  
5. Read the source-language badge, summary, corrected or translated text, and issue list.
6. **Copy** the result, or **Replace** when the selection is in an editable field.

### Tips

- Scroll freely — the mode bar stays at the top of the **viewport** and does not cover your selection.  
- Clear the selection or click away → the mode bar **hides**.  
- Press **Escape** to close the toolbar and result panel. This also cancels a running check.  
- Long results use **one** panel scrollbar; corrected text expands to its full height.  
- Languages such as English, Czech, Slovak (and many others) are **auto-detected**.

## Choosing a mode

| Mode | Use when |
|------|----------|
| Grammar | You want correctness and minimal edits for the wording rules below |
| Grammar + Style | You also want smoother, clearer wording without changing meaning |
| Translate to EN | The selection is in another language and you want a fluent English version |

All modes use common everyday words and simple sentences, and avoid stock AI phrasing, filler, and unnecessary formality. Grok must not introduce words or constructions more complex or formal than your original. Words you already used may stay.

Em dashes and semicolons in prose are replaced with suitable commas, periods, parentheses, or small sentence adjustments. Literal code, URLs, and verbatim quotations are preserved. Grammar makes only the minimal changes required; Grammar + Style may also improve clarity and flow.

## Text check

Every result goes through an automatic check before it is shown:

| Found in the result | What happens |
|---------------------|--------------|
| Typographic quotes or apostrophes, the `…` character, en dashes, non-breaking or invisible spaces, Markdown bold that your original does not use | Converted back to plain keyboard characters |
| Em dashes or semicolons | Grok gets one repair request; anything left is replaced with a comma or period |
| Emoji, arrows, or bullets your original does not use | Grok gets one repair request |
| Stock AI words or phrases your original does not use (for example *furthermore*, *leverage*, *v dnešnej dobe*, *prostredníctvom*, *nedílnou součástí*) | Grok gets one repair request (Grammar and Grammar + Style) |

Code in backticks, URLs, e-mail addresses, and HTML entities are never changed. Greek keeps `;` because it is the Greek question mark. The panel shows a green **Text check** line with what was fixed, and a yellow **Please review** line if something could not be fixed automatically. A repair request costs one extra API call and is made only when needed.

## Copy vs Replace

| Action | Behavior |
|--------|----------|
| **Copy** | Puts the full corrected or translated text on the clipboard |
| **Replace** | Swaps **only the text you selected** with the result. Text before/after the selection in the same box stays put (**1.1.2+**) |
| **Redo** | Runs the same check again with your **saved** popup model |
| **Grok 4.5** | One-time recheck with Grok 4.5 when the fast model result is not good enough (does **not** change your saved model) |

After a successful Replace, the editor selection is collapsed to a normal caret. Native editing shortcuts such as **Ctrl/Cmd+X** therefore continue to work normally (**1.1.6+**).

**Replace works best in:**

- `<input>` and `<textarea>`  
- Many `contenteditable` areas (`role="textbox"`, etc.)

**Replace may fail on:**

- Heavily scripted editors (some social compose boxes, collaborative docs)  
- Read-only page text (not an editor)

X/Draft.js replacements use the editor's own paste handler so its internal state stays editable. If another stateful rich editor rejects its native replacement, the extension copies the result instead of forcing visible but non-editable DOM text; paste it manually.

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
| Model | Empty-storage default `grok-4.5`. The popup marks **grok-4.20 non-reasoning** as recommended. Also `grok-4.7`, `grok-4.6`, `grok-4.3`, and grok-4.20 reasoning. Requests for grok-4.5, grok-4.6, and grok-4.7 use low reasoning effort. Grok 4.7 Fast is not available on the public API. |
| Test connection | Small request to verify key + model. |

## Limits

- Max selection length: **8000** characters (cost and latency).  
- Requests only run when you choose **Grammar**, **Grammar + Style**, or **Translate to EN** (nothing is sent while only selecting).

## X / Twitter and other SPAs

1. After installing or reloading the extension, **refresh the tab once**.  
2. Open Reply / compose, select text, use the top toolbar.  
3. If you see *Extension context invalidated*, click **Refresh page** in the error panel or press **F5**.

## Privacy in practice

- Nothing is sent until you choose **Grammar**, **Grammar + Style**, or **Translate to EN**.
- Only the selected text (plus the mode system prompt) goes to xAI. A text-check repair resends the same text with the first result.  
- Password fields are ignored.  
- No analytics; the project does not phone home to the authors.

## Keyboard / accessibility

- Toolbar and dialog use basic ARIA roles/labels.  
- Escape closes UI.  
- Further a11y improvements are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
