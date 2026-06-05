# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Duel runs two independent Claude API sessions side by side. The frontend is a **single file** (`index.html`) — no build, no npm, no framework. The **hosted deploy** (Cloudflare Pages, auto-deployed from `todd427/duel`) adds one server-side **Pages Function** (`functions/api/chat.js`) that injects secrets so the browser never holds any. There is still no server *you* run.

## Two modes (important)

`streamClaude` picks the transport by whether the API-key field has a value:
- **Hosted / proxy mode (no key):** POSTs `{model, system, messages, max_tokens, web, mnemos, rialu}` to **`/api/chat`** (the Pages Function), which adds the Anthropic key + web tools + MCP servers/tokens and streams the SSE back. The browser holds nothing. This is the normal path on `duel.foxxelabs.ie` (gated by Cloudflare Access).
- **BYOK / local mode (key present):** calls `api.anthropic.com` directly with `anthropic-dangerous-direct-browser-access`, building tools/`mcp_servers` client-side (MCP tokens from the Context panel). For opening `index.html` standalone.

## Running & testing

- **Hosted:** push to `todd427/duel` → Cloudflare Pages auto-deploys. Secrets live in the Pages project env (`ANTHROPIC_API_KEY`, `MNEMOS_MCP_TOKEN`, `RIALU_MCP_TOKEN`).
- **Local/BYOK:** open `index.html` and paste an API key (proxy isn't there, so it uses the direct path). `node --check` on the extracted `<script>` and on `functions/api/chat.js` catches syntax errors. No test suite; verify in a browser.
- The SSE parser is identical for both modes (the proxy passes Anthropic's stream straight through).

## Architecture

Everything is one file. The script section (from ~line 674) is the whole app.

- **Two panes, keyed `left` and `right`** throughout the code (these are α Alpha / β Beta in the UI). Almost every function takes a `side` argument of `'left'` or `'right'`. DOM IDs follow the pattern `model-<side>`, `sys-<side>`, `msgs-<side>`, `pane-<side>`.
- **`histories = { left: [], right: [] }`** — the two panes have completely separate conversation histories (the whole point of the tool: no shared context). Each entry is an Anthropic-format `{ role, content }` message.
- **`streamClaude(side, userText, attachments, hooks)`** — the core API call. Reads model/system-prompt/key from the DOM, pushes the user message to `histories[side]`, POSTs the full history with `stream: true`, and parses the SSE body via a `getReader()` loop. It **reconstructs the assistant content blocks** by index from `content_block_start/delta/stop` (text via `text_delta`; server-tool input via `input_json_delta`), calls `hooks.onText(accumulated)` per text delta and `hooks.onTool(label)` when a `server_tool_use` block completes, captures `stop_reason`, and pushes the **full block array** (text + any tool blocks) to history. It loops to resume on `stop_reason === 'pause_turn'` (guarded). `runStream(side, …)` wraps it: `ensure()` swaps the thinking dots for a live bubble (`startAssistantMsg`, which has a `.tools` chip row) on the first text **or** tool event, then `finalizeAssistant` re-renders and adds the cross-send button (plus a truncation note if `stop_reason === 'max_tokens'`).
- **Web access** — `webTools()` returns the Anthropic-hosted `web_search_20250305` + `web_fetch_20250910` server tools when the header `#webToggle` is checked (else `null`); they run server-side (no backend), so it's just `body.tools`. `web_fetch` can only read URLs already in context, so both tools are enabled together. Toggle state persists in `localStorage` (`duel_web`, default on). Note: assistant history entries are now **block arrays**, not strings — `exportMd` already filters `type === 'text'`.
- **Read-only MCP context** — `MCP_SERVERS` (`mnemos` → `mnemos.foxxelabs.ie/mcp`, `rialu` → `rialu.ie/mcp`) + `mcpConfig()` add the Anthropic **MCP connector** (`body.mcp_servers` + an `mcp_toolset` per server, plus beta header `mcp-client-2025-11-20`) when a server is toggled on (`localStorage` `duel_mcp_<id>_on`) **and** a token is present (`sessionStorage` `duel_mcp_<id>`). **Read-only is enforced in code** via `default_config: {enabled:false}` + a per-tool allow-list (`configs`) — writes (`update_project`, `create_project`, `ingest_document`) are never enabled; to change scope edit `MCP_SERVERS[*].readonly`. Both servers use **OAuth 2.1 (no static key)** — the token is a bearer the user supplies in the `🧠 Context` panel (`toggleCtx`). MCP tool calls stream as `mcp_tool_use`/`mcp_tool_result` blocks, reconstructed by the same generic block loop; chip is `🧠 <server>: <tool>`. The MCP beta header is only sent when at least one server is active.
- **`send()`** — driven by the **route** (`left` / `right` / `both`). For `both`, fires `runStream` to both panes in parallel via `Promise.all`. Guarded by a global `busy` flag.
- **`crossSend(content, targetSide)`** — takes one pane's response and injects it as a *user* message into the other pane. The ✕/sigil button on each assistant message wires this up (`appendMsg` adds it; target is the opposite side).
- **`buildContent(text, attachments)`** — converts pending attachments into Anthropic content blocks: images → base64 `image` blocks, PDFs → `document` blocks, text/code → fenced code prepended as text. `pendingFiles` holds staged attachments; `attachFiles`/`removeFile`/`renderStrip` manage the attach strip.
- **`renderMd(text)`** — a small hand-rolled Markdown renderer (code fences, inline code, lists, paragraphs). There is no Markdown library.
- **`exportMd()`** — serializes both `histories` into a single timestamped Markdown file for download.

## Conventions & constraints

- **Keep the frontend single-file and dependency-free.** All HTML/CSS/JS stays in `index.html`; no build step, npm, or CDN imports unless explicitly asked. The only backend is `functions/api/chat.js` (a Cloudflare Pages Function) — keep it dependency-free too (Workers runtime only).
- **⚠ Tool/MCP definitions live in TWO places — keep them in sync.** `webTools()` / `mcpConfig()` (in `index.html`, BYOK path) and the `MCP` map + tool-building in `functions/api/chat.js` (proxy path) must match. If you change a model list, a web-tool version, or an MCP read-only allow-list, edit **both** or hosted and local will diverge.
- `left`/`right` are the internal identifiers; α/β/Alpha/Beta are display labels only.
- **Accessibility: all four themes must hold WCAG AAA text contrast (≥7:1).** Each theme defines `--text` / `--text-dim` / `--text-faint` (all ≥7:1; dim ~8:1) plus `--left-ink` / `--right-ink` (text-legible accent variants — accents themselves are kept vivid for borders/dots/tints and are **not** contrast-safe as text), and `--error` / `--warn`. Use `--*-ink`/`--error`/`--warn` for any *text*; reserve `--*-accent` for borders/backgrounds. Don't apply `opacity` to already-dimmed text. If you touch theme colors, re-verify with the contrast math (composite alpha over `bg`/`surface`/`surface2`, worst case is `surface2`).
- Missing API key is surfaced loudly via `flagMissingKey()` (focus + red shake on `#apiKey`, `.needs-key` on the label, status text); the `#apiKey` input listener clears `.needs-key` on type.
- **Persistence:** theme in `localStorage` (`duel_theme`); API key in `sessionStorage` (`duel_key`); system prompts + model choices + max-tokens in `localStorage` (`duel_settings`, written by `saveSettings()` over `PERSIST_IDS`, restored on load). Four themes live as CSS via `data-t` attributes and `setTheme()`.
- **Presets** (`PRESETS` + `applyPreset`) fill both `sys-<side>` textareas from the header `#presetSel` dropdown; add new pairs to the `PRESETS` map and a matching `<option>`.
- Supported models are hardcoded in the two `<select id="model-<side>">` elements — update both panes when changing the list.
- `max_tokens` comes from the `#maxTokens` input via `maxTokens()` (default 4096, clamped 256–64000); `anthropic-version` is `2023-06-01`. Requests use `stream: true` — keep new API code on the SSE path.
