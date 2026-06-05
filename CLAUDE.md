# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Duel is a **single-file browser tool** (`index.html`) for running two independent Claude API sessions side by side. There is no build step, no npm, no framework, no backend. All HTML, CSS, and JS live in `index.html`.

## Running & testing

- **Run:** open `index.html` directly in a browser (`open index.html` / `xdg-open index.html`). No server needed.
- **No build, no lint, no test suite.** Changes are verified by loading the file in a browser.
- The app is BYOK: it needs an Anthropic API key entered in the UI (stored in `sessionStorage` as `duel_key`). API calls go directly from the browser to `api.anthropic.com` using the `anthropic-dangerous-direct-browser-access: true` header.

## Architecture

Everything is one file. The script section (from ~line 674) is the whole app.

- **Two panes, keyed `left` and `right`** throughout the code (these are α Alpha / β Beta in the UI). Almost every function takes a `side` argument of `'left'` or `'right'`. DOM IDs follow the pattern `model-<side>`, `sys-<side>`, `msgs-<side>`, `pane-<side>`.
- **`histories = { left: [], right: [] }`** — the two panes have completely separate conversation histories (the whole point of the tool: no shared context). Each entry is an Anthropic-format `{ role, content }` message.
- **`callClaude(side, userText, attachments)`** — the core API call. Reads model/system-prompt/key from the DOM, pushes the user message to `histories[side]`, POSTs the full history, pushes the assistant reply back. Per-pane `system` prompt and `model` are sent independently.
- **`send()`** — driven by the **route** (`left` / `right` / `both`). For `both`, fires `callClaude` to both panes in parallel via `Promise.all`. Guarded by a global `busy` flag.
- **`crossSend(content, targetSide)`** — takes one pane's response and injects it as a *user* message into the other pane. The ✕/sigil button on each assistant message wires this up (`appendMsg` adds it; target is the opposite side).
- **`buildContent(text, attachments)`** — converts pending attachments into Anthropic content blocks: images → base64 `image` blocks, PDFs → `document` blocks, text/code → fenced code prepended as text. `pendingFiles` holds staged attachments; `attachFiles`/`removeFile`/`renderStrip` manage the attach strip.
- **`renderMd(text)`** — a small hand-rolled Markdown renderer (code fences, inline code, lists, paragraphs). There is no Markdown library.
- **`exportMd()`** — serializes both `histories` into a single timestamped Markdown file for download.

## Conventions & constraints

- **Keep it single-file and dependency-free.** Do not introduce a build step, npm packages, or external script/CDN imports unless explicitly asked.
- `left`/`right` are the internal identifiers; α/β/Alpha/Beta are display labels only.
- **Theme** is persisted in `localStorage` (`duel_theme`); the **API key** in `sessionStorage` (`duel_key`). Four themes live as CSS via `data-t` attributes and `setTheme()`.
- Supported models are hardcoded in the two `<select id="model-<side>">` elements — update both panes when changing the list.
- `max_tokens` is hardcoded (2048) and `anthropic-version` is `2023-06-01` in `callClaude`.
