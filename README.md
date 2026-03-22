# Duel

**Two independent Claude sessions. One problem. No shared context.**

Duel is a single-file browser tool for running two Claude API sessions side by side. Send the same question to both simultaneously, watch them diverge, then fire one's answer at the other for reaction.

→ **[duel.foxxelabs.ie](https://duel.foxxelabs.ie)**

---

## What it does

- Two independent panes — **α Alpha** and **β Beta** — each with its own model, system prompt, and conversation history
- **Route selector** — send to Alpha only, Both (parallel), or Beta only
- **Cross-send** — send any response from one pane to the other as a new user message
- **File attachments** — images (vision), PDFs, text/code files; drag and drop works
- **Export MD** — downloads both conversation threads as a timestamped Markdown file
- **Four themes** — Parchment, Folio (default), Obsidian, Modern
- Enter = newline. Send = button.

## What it's for

Architecture review. Two system prompts:

> **α:** *You are a sceptical architect. Challenge every assumption. Find the failure mode.*
> **β:** *You are a pragmatic builder. Find the path forward.*

Send the same design problem to both. Cross-send β's proposal to α. Watch the sceptic work on it.

Also useful for: writing feedback, argument stress-testing, comparing reasoning styles across models (Opus vs Sonnet, etc.), or just watching two independent minds work through the same hard question simultaneously.

## Requirements

- An [Anthropic API key](https://console.anthropic.com) — bring your own, stored in `sessionStorage`, sent only to `api.anthropic.com`
- A modern browser

## Usage

**Hosted:** visit [duel.foxxelabs.ie](https://duel.foxxelabs.ie) — enter your email for a one-time access code (Cloudflare Access, sessions last 24h)

**Local:** clone the repo, open `index.html` directly in a browser. No build step, no server, no dependencies.

```bash
git clone https://github.com/todd427/duel
open duel/index.html
```

## Technical notes

- Single HTML file — no build step, no npm, no framework
- API key never leaves the browser except in direct calls to `api.anthropic.com`
- Uses `anthropic-dangerous-direct-browser-access: true` header for direct browser API access (BYOK pattern)
- No backend, no analytics, no logging
- File attachments: images → base64 vision blocks, PDFs → document blocks, text/code → fenced code blocks prepended to message

## Models supported

- `claude-opus-4-6`
- `claude-sonnet-4-6` (default)
- `claude-haiku-4-5-20251001`

Each pane selects independently.

## License

MIT — fork it, host it, strip the auth, use it however you like.

---

Built by [FoxxeLabs](https://foxxelabs.ie) · [Article](https://foxxelabs.ie/resources/duel-two-claudes-walk-into-a-problem)
