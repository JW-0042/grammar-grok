# Security Policy

**Project version:** documented releases through **1.1.4** (see [CHANGELOG.md](CHANGELOG.md)). Security design notes below apply to the current main branch.

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
| Selected text | Sent to `https://api.x.ai` **only when you click** Grammar or Grammar + Style. |
| Analytics | **None.** No telemetry, no third-party trackers. |

## What is **not** in this repository

- No API keys  
- No personal accounts, emails, or billing data  
- No production secrets  

**Never commit** `.env` files, exported keys, or packed `.pem` files used for Chrome Web Store signing. See `.gitignore`.

## Hardening notes (for reviewers)

- API calls run only in the **background service worker**  
- Content scripts cannot read the API key  
- Host permission limited to `https://api.x.ai/*`  
- Model names are allowlisted  
- Message senders are checked against `chrome.runtime.id`  
- Response fields are length-clamped before UI render  
- Result UI uses DOM text nodes (no untrusted HTML injection of model output)  
- Content scripts only on `http`/`https` (not `file://` or Chrome internal pages)  
- Fetch timeouts, abort of overlapping checks, light client rate spacing  
- Errors scrubbed of key-like patterns (`xai-…`, `Bearer …`)

## Scope

- This project is a **local unpacked / open-source** extension.  
- You are responsible for your own [xAI](https://console.x.ai) API usage and billing.  
- Grok.com / SuperGrok chat subscriptions are **not** used by this extension.
