# Duel

**Two independent Claude sessions. One problem. No shared context.**

Duel is a single-file browser tool for running two Claude API sessions side by side. Send the same question to both simultaneously, watch them diverge, then fire one's answer at the other for reaction.

→ **[duel.foxxelabs.ie](https://duel.foxxelabs.ie)**

---

## What it does

- Two independent panes — **α Alpha** and **β Beta** — each with its own model, system prompt, and conversation history
- **Streaming** — responses render token-by-token live in each pane (both panes stream in parallel)
- **Web access** — optional `🌐 Web` toggle gives both panes Anthropic-hosted web search + fetch (server-side); tool activity is shown inline
- **Context (read-only)** — optional `🧠 Context` panel connects Mnemos (memory corpus) + Rialú (project state) over MCP, so both panes can ground answers in *your* world; read-only, BYO OAuth token per server
- **Route selector** — send to Alpha only, Both (parallel), or Beta only
- **Cross-send** — send any response from one pane to the other as a new user message
- **Presets** — one-click system-prompt pairs (Sceptic ⚔ Builder, Red ⚔ Blue team, Line ⚔ Dev editor)
- **Configurable max tokens** — set the per-reply output budget; truncated replies are flagged
- **File attachments** — images (vision), PDFs, text/code files; drag and drop works
- **Export MD** — downloads both conversation threads as a timestamped Markdown file
- **Four themes** — Parchment, Folio (default), Obsidian, Modern — all WCAG AAA (≥7:1 text contrast)
- **Persistence** — system prompts, model choices, max tokens, and theme survive a refresh (API key kept in `sessionStorage`)
- Enter = newline. Send = button.

## What it's for

Architecture review. Two system prompts:

> **α:** *You are a sceptical architect. Challenge every assumption. Find the failure mode.*
> **β:** *You are a pragmatic builder. Find the path forward.*

Send the same design problem to both. Cross-send β's proposal to α. Watch the sceptic work on it.

Also useful for: writing feedback, argument stress-testing, comparing reasoning styles across models (Opus vs Sonnet, etc.), or just watching two independent minds work through the same hard question simultaneously.

## Requirements

- **Hosted:** nothing — the key lives server-side (Cloudflare Pages Function), so you just sign in.
- **Local / standalone:** an [Anthropic API key](https://console.anthropic.com) — bring your own, stored in `sessionStorage`, sent only to `api.anthropic.com`.
- A modern browser.

## Usage

**Hosted:** visit [duel.foxxelabs.ie](https://duel.foxxelabs.ie) — sign in via Cloudflare Access. No API key to enter; a Pages Function injects the key and any context tokens server-side.

**Local:** clone the repo, open `index.html` directly in a browser, and paste your own API key (with no proxy present, it calls Anthropic directly). No build step, no dependencies.

```bash
git clone https://github.com/todd427/duel
open duel/index.html
```

## Technical notes

- Single-file frontend (`index.html`) — no build step, no npm, no framework
- Hosted deploy adds one Cloudflare Pages Function (`functions/api/chat.js`) — a server-side proxy that injects the Anthropic key + MCP tokens and streams the response back; the browser holds no secrets
- BYOK/local path uses the `anthropic-dangerous-direct-browser-access: true` header to call `api.anthropic.com` directly
- No analytics, no logging; the only backend is the stateless Pages Function
- Responses stream over SSE (`stream: true`), parsed from the `fetch` body reader — no SDK
- Web access uses Anthropic's server-side `web_search` + `web_fetch` tools (run on Anthropic's infra, not the browser); no extra backend, no API key beyond your own
- Context uses Anthropic's MCP connector (server-side) against Mnemos/Rialú with read-only tool allow-lists; OAuth bearer tokens are entered per server and kept in `sessionStorage`
- File attachments: images → base64 vision blocks, PDFs → document blocks, text/code → fenced code blocks prepended to message

## Models supported

- `claude-opus-4-8`
- `claude-opus-4-7`
- `claude-opus-4-6`
- `claude-sonnet-4-6` (default)
- `claude-haiku-4-5`

Each pane selects independently.

## License

MIT — fork it, host it, strip the auth, use it however you like.

---

Built by [FoxxeLabs](https://foxxelabs.ie) · [Article](https://foxxelabs.ie/resources/duel-two-claudes-walk-into-a-problem)
