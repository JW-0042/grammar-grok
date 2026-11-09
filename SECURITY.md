# Security Policy

**Project version:** documented releases through **1.3.1** (see [CHANGELOG.md](CHANGELOG.md)). Security design notes below apply to the current main branch.

## Reporting a vulnerability

If you discover a security issue in **Grammar Grok**, please **do not** open a public GitHub issue.

Instead:

1. Open a private report via GitHub **Security → Advisories → Report a vulnerability** on this repository, or  
2. Contact the maintainer through GitHub (@JW-0042).

Please include:

- Description of the issue  
- Steps to reproduce  
- Potential impact  
- Suggested fix (if any)

We will try to respond within a reasonable time and coordinate a fix before public disclosure.

## What this extension does with your data

| Data | Where it goes |
|------|----------------|
| xAI API key | Stored only in your browser (`chrome.storage.local`). Never sent anywhere except as `Authorization: Bearer` to `https://api.x.ai`. |
| Selected text | Sent to `https://api.x.ai` **only when you choose** Grammar, Grammar + Style, or Translate to EN. |
| Analytics | **None.** No telemetry, no third-party trackers. |

## What is **not** in this repository

- No API keys  
- No personal accounts, emails, or billing data  
- No production secrets  

**Never commit** `.env` files, exported keys, or packed `.pem` files used for Chrome Web Store signing. See `.gitignore`.

## Hardening notes (for reviewers)

- API calls run only in the **background service worker**  
- Content scripts cannot read the API key; the service worker also restricts `chrome.storage.local` to trusted extension contexts where Chrome supports it  
- Password fields are never read or sent  
- Toolbar and panel actions require trusted (real user) clicks, so page scripts cannot trigger API requests  
- `TEST_KEY` is accepted only from the popup; streaming ports only from this extension's content scripts in a tab  
- Host permission limited to `https://api.x.ai/*`  
- `debugger` permission (required, Chrome does not allow it as optional): attached only to the sender's own tab, only after a real click on **Replace by typing**, only while typing, and only the `Input` domain (`Input.dispatchKeyEvent`, `Input.insertText`). Detached in a `finally` block; Chrome's debugging bar stays visible meanwhile and its Cancel stops typing  
- Model names are allowlisted  
- Message senders are checked against `chrome.runtime.id`  
- Response size and shape are validated; issue fields are length-clamped and oversized corrected/translated output is rejected
- Result UI uses DOM text nodes (no untrusted HTML injection of model output)  
- Content scripts only on `http`/`https` (not `file://` or Chrome internal pages)  
- Fetch timeouts, per-tab/frame abort of overlapping checks, light client rate spacing
- Errors scrubbed of key-like patterns (`xai-…`, `Bearer …`)

## Scope

- This project is a **local unpacked / open-source** extension.  
- You are responsible for your own [xAI](https://console.x.ai) API usage and billing.  
- Grok.com / SuperGrok chat subscriptions are **not** used by this extension.
