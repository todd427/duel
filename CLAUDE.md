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
- **`streamClaude(side, userText, attachments, onText)`** — the core API call. Reads model/system-prompt/key from the DOM, pushes the user message to `histories[side]`, POSTs the full history with `stream: true`, parses the SSE body via a `getReader()` loop (accumulating `text_delta`s, capturing `stop_reason`), calls `onText(accumulated)` per delta, then pushes the assistant reply back. Per-pane `system` and `model` are sent independently. `runStream(side, …)` wraps it: swaps the thinking dots for a live bubble (`startAssistantMsg`) on the first token, then `finalizeAssistant` re-renders and adds the cross-send button (plus a truncation note if `stop_reason === 'max_tokens'`).
- **`send()`** — driven by the **route** (`left` / `right` / `both`). For `both`, fires `runStream` to both panes in parallel via `Promise.all`. Guarded by a global `busy` flag.
- **`crossSend(content, targetSide)`** — takes one pane's response and injects it as a *user* message into the other pane. The ✕/sigil button on each assistant message wires this up (`appendMsg` adds it; target is the opposite side).
- **`buildContent(text, attachments)`** — converts pending attachments into Anthropic content blocks: images → base64 `image` blocks, PDFs → `document` blocks, text/code → fenced code prepended as text. `pendingFiles` holds staged attachments; `attachFiles`/`removeFile`/`renderStrip` manage the attach strip.
- **`renderMd(text)`** — a small hand-rolled Markdown renderer (code fences, inline code, lists, paragraphs). There is no Markdown library.
- **`exportMd()`** — serializes both `histories` into a single timestamped Markdown file for download.

## Conventions & constraints

- **Keep it single-file and dependency-free.** Do not introduce a build step, npm packages, or external script/CDN imports unless explicitly asked.
- `left`/`right` are the internal identifiers; α/β/Alpha/Beta are display labels only.
- **Accessibility: all four themes must hold WCAG AAA text contrast (≥7:1).** Each theme defines `--text` / `--text-dim` / `--text-faint` (all ≥7:1; dim ~8:1) plus `--left-ink` / `--right-ink` (text-legible accent variants — accents themselves are kept vivid for borders/dots/tints and are **not** contrast-safe as text), and `--error` / `--warn`. Use `--*-ink`/`--error`/`--warn` for any *text*; reserve `--*-accent` for borders/backgrounds. Don't apply `opacity` to already-dimmed text. If you touch theme colors, re-verify with the contrast math (composite alpha over `bg`/`surface`/`surface2`, worst case is `surface2`).
- Missing API key is surfaced loudly via `flagMissingKey()` (focus + red shake on `#apiKey`, `.needs-key` on the label, status text); the `#apiKey` input listener clears `.needs-key` on type.
- **Persistence:** theme in `localStorage` (`duel_theme`); API key in `sessionStorage` (`duel_key`); system prompts + model choices + max-tokens in `localStorage` (`duel_settings`, written by `saveSettings()` over `PERSIST_IDS`, restored on load). Four themes live as CSS via `data-t` attributes and `setTheme()`.
- **Presets** (`PRESETS` + `applyPreset`) fill both `sys-<side>` textareas from the header `#presetSel` dropdown; add new pairs to the `PRESETS` map and a matching `<option>`.
- Supported models are hardcoded in the two `<select id="model-<side>">` elements — update both panes when changing the list.
- `max_tokens` comes from the `#maxTokens` input via `maxTokens()` (default 4096, clamped 256–64000); `anthropic-version` is `2023-06-01`. Requests use `stream: true` — keep new API code on the SSE path.
