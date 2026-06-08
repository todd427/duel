# Duel

**Two independent Claude sessions. One problem. No shared context.**

Duel is a single-file browser tool for running two Claude API sessions side by side. Send the same question to both simultaneously, watch them diverge, then fire one's answer at the other for reaction.

→ **[duel.foxxelabs.ie](https://duel.foxxelabs.ie)**

---

## What it does

- Two independent panes — **α Alpha** and **β Beta** — each with its own model, system prompt, and conversation history
- **Streaming** — responses render token-by-token live in each pane (both panes stream in parallel)
- **Web access** — optional `🌐 Web` toggle gives both panes Anthropic-hosted web search + fetch (server-side); tool activity is shown inline
- **Context (read-only)** — both panes can ground answers in *your* world via Mnemos (memory corpus) + Rialú (project state) over MCP; always on, read-only, tokens injected server-side
- **Route selector** — send to Alpha only, Both (parallel), or Beta only
- **Cross-send** — send any response from one pane to the other as a new user message
- **Presets** — one-click system-prompt pairs (Sceptic ⚔ Builder, Red ⚔ Blue team, Line ⚔ Dev editor)
- **Configurable max tokens** — set the per-reply output budget; truncated replies are flagged
- **File attachments** — images (vision), PDFs, text/code files; drag and drop works
- **Spend tracking** — a running session cost + token totals, computed per-model from the API's `usage`, shown in the header; click to reset
- **Export MD** — downloads both conversation threads as a timestamped Markdown file
- **Readable type** — message/code/compose text auto-scales with window width, plus an `A− / A+` nudge (persists)
- **Four themes** — Parchment, Folio (default), Obsidian, Modern — all WCAG AAA (≥7:1 text contrast)
- **Persistence** — system prompts, model choices, max tokens, theme, and toggles survive a refresh (no secrets stored client-side)
- Enter = newline. Send = button.

## What it's for

Architecture review. Two system prompts:

> **α:** *You are a sceptical architect. Challenge every assumption. Find the failure mode.*
> **β:** *You are a pragmatic builder. Find the path forward.*

Send the same design problem to both. Cross-send β's proposal to α. Watch the sceptic work on it.

Also useful for: writing feedback, argument stress-testing, comparing reasoning styles across models (Opus vs Sonnet, etc.), or just watching two independent minds work through the same hard question simultaneously.

## Requirements

- **To use it:** nothing — visit the hosted site and sign in. The Anthropic key and any context tokens live server-side (Cloudflare Pages Function); the browser holds no secrets.
- **To self-host:** a Cloudflare Pages project (auto-deploy from the repo) with `ANTHROPIC_API_KEY` set as an env var. For the optional Mnemos/Rialú context, add `RIALU_MCP_STATIC_TOKEN` / `MNEMOS_MCP_STATIC_TOKEN`.
- A modern browser.

## Usage

**Hosted:** visit [duel.foxxelabs.ie](https://duel.foxxelabs.ie) — sign in via Cloudflare Access. Nothing to configure; a Pages Function injects the key and context tokens server-side.

**Local dev:** clone the repo and run it with Wrangler so the `/api/chat` function is available:

```bash
git clone https://github.com/todd427/duel
cd duel && npx wrangler pages dev .   # needs ANTHROPIC_API_KEY in the env
```

## Technical notes

- Single-file frontend (`index.html`) — no build step, no npm, no framework
- One Cloudflare Pages Function (`functions/api/chat.js`) is the only backend — a stateless proxy that injects the Anthropic key + MCP tokens and streams the response back; the browser holds no secrets and sends only feature toggles
- No analytics, no logging
- Responses stream over SSE (`stream: true`), parsed from the `fetch` body reader — no SDK
- Web access uses Anthropic's server-side `web_search` + `web_fetch` tools (run on Anthropic's infra, not the browser)
- Context uses Anthropic's MCP connector (server-side) against Mnemos/Rialú with read-only tool allow-lists; bearer tokens are server-side env vars, never in the browser
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
