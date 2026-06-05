# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Duel runs two independent Claude API sessions side by side. The frontend is a **single file** (`index.html`) — no build, no npm, no framework. The **hosted deploy** (Cloudflare Pages, auto-deployed from `todd427/duel`) adds one server-side **Pages Function** (`functions/api/chat.js`) that injects secrets so the browser never holds any. There is still no server *you* run.

## Hosted / proxy-only (important)

The browser holds **no secrets** and there is **no API-key field or BYOK/direct path**. `streamClaude` always POSTs `{model, system, messages, max_tokens, web, mnemos, rialu}` (the last three are toggle booleans) to **`/api/chat`** — the Cloudflare Pages Function (`functions/api/chat.js`), which injects the Anthropic key, web tools, and the Mnemos/Rialú MCP servers + tokens, then streams the SSE straight back.

## Running & testing

- **Hosted:** push to `todd427/duel` → Cloudflare Pages auto-deploys. Secrets live in the Pages project env: `ANTHROPIC_API_KEY` plus the MCP bearers `RIALU_MCP_STATIC_TOKEN` / `MNEMOS_MCP_STATIC_TOKEN` (the function also accepts `*_MCP_TOKEN`). Gated by Cloudflare Access.
- **Local dev:** run `wrangler pages dev` so `/api/chat` exists — opening `index.html` as a file no longer works (no proxy). `node --check` on the extracted `<script>` and on `functions/api/chat.js` catches syntax errors; no test suite, verify in a browser.

## Architecture

The frontend is one file (`index.html`); the backend is `functions/api/chat.js`. The `index.html` script section is the whole client app.

- **Two panes, keyed `left` and `right`** throughout the code (these are α Alpha / β Beta in the UI). Almost every function takes a `side` argument of `'left'` or `'right'`. DOM IDs follow the pattern `model-<side>`, `sys-<side>`, `msgs-<side>`, `pane-<side>`.
- **`histories = { left: [], right: [] }`** — the two panes have completely separate conversation histories (the whole point of the tool: no shared context). Each entry is an Anthropic-format `{ role, content }` message.
- **`streamClaude(side, userText, attachments, hooks)`** — the core API call. Reads model/system-prompt from the DOM, pushes the user message to `histories[side]`, POSTs to `/api/chat` (with `web`/`mnemos`/`rialu` toggle booleans), and parses the SSE body via a `getReader()` loop. It **reconstructs the assistant content blocks** by index from `content_block_start/delta/stop` (text via `text_delta`; server-tool input via `input_json_delta`), calls `hooks.onText(accumulated)` per text delta and `hooks.onTool(label)` when a `server_tool_use`/`mcp_tool_use` block completes, captures `stop_reason`, and pushes the **full block array** (text + any tool blocks) to history. It loops to resume on `stop_reason === 'pause_turn'` (guarded). `runStream(side, …)` wraps it: `ensure()` swaps the thinking dots for a live bubble (`startAssistantMsg`, which has a `.tools` chip row) on the first text **or** tool event, then `finalizeAssistant` re-renders and adds the cross-send button (plus a truncation note if `stop_reason === 'max_tokens'`).
- **Web + MCP context are built server-side** in `functions/api/chat.js`. The frontend sends booleans: `web` (header `#webToggle`, persisted `duel_web`) and `mnemos`/`rialu` — the latter two are **always `true`** (context is always-on; there is no Context UI). The Function turns those into `web_search_20250305` + `web_fetch_20250910` and the MCP connector (`mcp_servers` + a read-only `mcp_toolset` per server, beta header `mcp-client-2025-11-20`). **Read-only is enforced there** via `default_config:{enabled:false}` + a per-tool allow-list; writes (`update_project`/`create_project`/`ingest_document`) are never enabled. Web/MCP calls stream back as `server_tool_use`/`mcp_tool_use` + result blocks (handled by the same generic reconstruction); chips are `🔍 searched` / `🌐 fetched` / `🧠 <server>: <tool>`. Assistant history entries are **block arrays**, not strings — `exportMd` filters `type === 'text'`.
- **`send()`** — driven by the **route** (`left` / `right` / `both`). For `both`, fires `runStream` to both panes in parallel via `Promise.all`. Guarded by a global `busy` flag.
- **`crossSend(content, targetSide)`** — takes one pane's response and injects it as a *user* message into the other pane. The ✕/sigil button on each assistant message wires this up (`appendMsg` adds it; target is the opposite side).
- **`buildContent(text, attachments)`** — converts pending attachments into Anthropic content blocks: images → base64 `image` blocks, PDFs → `document` blocks, text/code → fenced code prepended as text. `pendingFiles` holds staged attachments; `attachFiles`/`removeFile`/`renderStrip` manage the attach strip.
- **`renderMd(text)`** — a small hand-rolled Markdown renderer (code fences, inline code, lists, paragraphs). There is no Markdown library.
- **`exportMd()`** — serializes both `histories` into a single timestamped Markdown file for download.
- **Spend tracking** — `recordUsage(model, u)` runs once per response with usage parsed from the stream (`message_start` → input/cache tokens, `message_delta` → output tokens), priced via the `PRICING` map (per-1M; cache read ≈0.1×, write ≈1.25×), accumulated into `spend` (persisted `localStorage` `duel_spend`), shown in `#spendBtn` (click → `resetSpend()`). Update `PRICING` when prices or the model list change (it's separate from the `<select>` options). Cost excludes web-search/tool surcharges — it's token-based.

## Conventions & constraints

- **Keep the frontend single-file and dependency-free.** All HTML/CSS/JS stays in `index.html`; no build step, npm, or CDN imports unless explicitly asked. The only backend is `functions/api/chat.js` (a Cloudflare Pages Function) — keep it dependency-free too (Workers runtime only).
- **Tool/MCP definitions live in `functions/api/chat.js` only** (web-tool versions, MCP server URLs, read-only allow-lists, the `*_MCP_STATIC_TOKEN`/`*_MCP_TOKEN` env lookups). The frontend just sends feature booleans. Model lists live in the two `<select id="model-<side>">` elements; everything tool/server-related is in the Function.
- `left`/`right` are the internal identifiers; α/β/Alpha/Beta are display labels only.
- **Accessibility: all four themes must hold WCAG AAA text contrast (≥7:1).** Each theme defines `--text` / `--text-dim` / `--text-faint` (all ≥7:1; dim ~8:1) plus `--left-ink` / `--right-ink` (text-legible accent variants — accents themselves are kept vivid for borders/dots/tints and are **not** contrast-safe as text), and `--error` / `--warn`. Use `--*-ink`/`--error`/`--warn` for any *text*; reserve `--*-accent` for borders/backgrounds. Don't apply `opacity` to already-dimmed text. If you touch theme colors, re-verify with the contrast math (composite alpha over `bg`/`surface`/`surface2`, worst case is `surface2`).
- **Persistence (all `localStorage`):** theme (`duel_theme`); web toggle (`duel_web`); system prompts + model choices + max-tokens (`duel_settings`, via `saveSettings()` over `PERSIST_IDS`). No secrets are stored client-side. Four themes live as CSS via `data-t` attributes and `setTheme()`.
- **Presets** (`PRESETS` + `applyPreset`) fill both `sys-<side>` textareas from the header `#presetSel` dropdown; add new pairs to the `PRESETS` map and a matching `<option>`.
- Supported models are hardcoded in the two `<select id="model-<side>">` elements — update both panes when changing the list.
- `max_tokens` comes from the `#maxTokens` input via `maxTokens()` (default 4096, clamped 256–64000); `anthropic-version` is `2023-06-01`. Requests use `stream: true` — keep new API code on the SSE path.
