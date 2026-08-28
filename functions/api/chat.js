// Cloudflare Pages Function — server-side proxy for Duel.
//
// The browser sends only the conversation + feature flags; this function
// injects the secrets (Anthropic key, MCP bearer tokens) and the tool
// definitions, calls the Anthropic Messages API, and streams the SSE
// response straight back. Nothing sensitive ever reaches the client.
//
// Configure in the Cloudflare Pages project → Settings → Environment variables
// (encrypted): ANTHROPIC_API_KEY, plus the MCP vars below.
// Access is already gated by Cloudflare Access in front of the site.

// ── MCP registry ──────────────────────────────────────────────────────────────
// Adding or removing a server is an ENV-VAR change — no code edit, no frontend
// edit. Set these in the Pages env and the server appears in the picker:
//
//   <ID>_MCP_URL            required to add a server not built in below
//   <ID>_MCP_STATIC_TOKEN   the bearer (or <ID>_MCP_TOKEN)
//   <ID>_MCP_LABEL          optional display name   (default: the id)
//   <ID>_MCP_NOTE           optional one-line blurb
//   <ID>_MCP_ALLOW          optional comma-separated tool allow-list
//   <ID>_MCP_WRITES         optional "1" to badge it as write-capable
//
// With no _MCP_ALLOW the function asks the server what it has (tools/list) and
// enables what it finds, minus DENY below. Drop the vars to remove a server.
//
// The per-tool allow-list is enforced HERE, on the server — the browser can ask
// for a server by id but never for a tool.
const BUILTIN = {
  mnemos: {
    url: 'https://mnemos.foxxelabs.ie/mcp',
    label: 'Mnemos', note: 'Personal corpus — conversations, notes, research',
    tools: ['query_memory', 'get_conversation', 'get_belief_context',
            'get_stats', 'get_doc_count', 'list_filters'],
  },
  rialu: {
    url: 'https://rialu.ie/mcp',
    label: 'Rialú', note: 'Project status across the portfolio',
    tools: ['list_projects', 'get_project'],
  },
  git: {
    url: 'https://git-mcp-foxxelabs.fly.dev/mcp',
    label: 'git-mcp', note: 'GitHub repos — read, commit and push', writes: true,
    // Deliberately write-capable. Destructive ops (delete_file, reset,
    // reclone, merge) are still withheld.
    tools: ['git_status', 'git_log', 'git_diff', 'git_read_file', 'git_list_files',
            'git_list_repos', 'git_list_remote_repos', 'git_kloc', 'git_kloc_all',
            'git_clone', 'git_pull',
            'git_add', 'git_commit', 'git_push', 'git_write_file',
            'git_branch', 'git_checkout'],
  },
  taisce: {
    url: 'https://taisce.irish/mcp',
    label: 'Taisce', note: 'Vault metadata only — never reveals a secret',
    // Metadata only — reveal_*/store_*/delete_* are never enabled, so no secret
    // value can be pulled into a chat pane.
    tools: ['vault_status', 'list_keys', 'list_logins', 'list_notes',
            'list_cards', 'list_trashed_keys'],
  },
  sentinel: {
    url: 'https://sentinel-foxxelabs.fly.dev/mcp',
    label: 'Sentinel', note: 'IP threat intelligence',
    tools: ['sentinel_stats', 'sentinel_check_ip', 'sentinel_top_offenders',
            'sentinel_recent_events', 'sentinel_projects', 'sentinel_blocklist'],
  },
  flyer: {
    url: 'https://fly-mcp-foxxelabs.fly.dev/mcp',
    label: 'Flyer', note: 'Fly.io app health, logs, deploys',
    tools: ['apps_list', 'app_status', 'app_logs', 'deploy_status',
            'machines_list', 'fleet_sizes', 'secrets_list'],
  },
  taithi: {
    url: 'https://taithi.fly.dev/mcp',
    label: 'Taithí', note: 'Facts taught to the local models',
    tools: ['taithi_facts'],
  },
  tomhas: {
    url: 'https://tomhas-foxxelabs.fly.dev/mcp',
    label: 'Tomhas', note: 'Session metrics and patterns',
    tools: ['status', 'history', 'patterns'],
  },
  ainm: {
    url: 'https://ainm-foxxelabs.fly.dev/mcp',
    label: 'Ainm', note: 'Name clearance — CRO, domains, trademarks',
    tools: ['check_name', 'check_company', 'check_domains'],
  },
  eric: {
    url: 'https://mark-foxxelabs.fly.dev/mcp',
    label: 'Eric', note: 'Marketing and sales intelligence',
    tools: ['ask_eric', 'get_digest', 'get_mood', 'get_signals', 'get_ranking',
            'get_pipeline', 'get_orbis_brief', 'get_terra_brief'],
  },
  fiosru: {
    url: 'https://fiosru-foxxelabs.fly.dev/mcp',
    label: 'Fiosrú', note: 'Background research jobs',
    tools: ['fork_list', 'fork_result'],
  },
};

// Never auto-enable these on a discovered server. An explicit <ID>_MCP_ALLOW
// still wins — this guards the "I just added a URL" path, where nobody has
// vetted the tool list, from exposing secrets or destroying state.
const DENY = /^(reveal|store|update|delete|set|forget|remember|ingest|create|write|push|commit|add|restore|generate)_|^(tick|new_session)$|_(reset|reclone|merge)$/;

const envToken = (env, id) => {
  const U = id.toUpperCase();
  return env[`${U}_MCP_STATIC_TOKEN`] || env[`${U}_MCP_TOKEN`] || '';
};

// Built-ins, plus anything the env adds via <ID>_MCP_URL. Env overrides win.
function registry(env) {
  const reg = {};
  for (const [id, cfg] of Object.entries(BUILTIN)) reg[id] = { ...cfg, id };
  for (const k of Object.keys(env)) {
    const m = /^([A-Z0-9]+)_MCP_URL$/.exec(k);
    if (!m || !env[k]) continue;
    const id = m[1].toLowerCase();
    reg[id] = { ...(reg[id] || { id }), id, url: String(env[k]) };
  }
  for (const [id, cfg] of Object.entries(reg)) {
    const U = id.toUpperCase();
    const allow = env[`${U}_MCP_ALLOW`];
    if (allow) cfg.tools = String(allow).split(',').map(s => s.trim()).filter(Boolean);
    if (env[`${U}_MCP_LABEL`]) cfg.label = String(env[`${U}_MCP_LABEL`]);
    if (env[`${U}_MCP_NOTE`]) cfg.note = String(env[`${U}_MCP_NOTE`]);
    if (env[`${U}_MCP_WRITES`]) cfg.writes = env[`${U}_MCP_WRITES`] !== '0';
    cfg.label ||= id;
    cfg.note ||= 'Added via the environment';
    cfg.token = envToken(env, id);
  }
  return reg;
}

// ── Tool discovery ────────────────────────────────────────────────────────────
// For a server with no <ID>_MCP_ALLOW we ask it what it has, so adding one is
// just a URL + a token. Streamable-HTTP MCP: initialize → initialized → list.
async function rpc(url, token, body, sid) {
  const h = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  };
  if (sid) h['mcp-session-id'] = sid;
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const session = r.headers.get('mcp-session-id') || sid;
  if (!r.ok) return { session, json: null };
  const text = await r.text();
  if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
    let json = null;
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        if (d && d.id === body.id) json = d;
      } catch { /* keep scanning */ }
    }
    return { session, json };
  }
  try { return { session, json: JSON.parse(text) }; } catch { return { session, json: null }; }
}

const discovered = new Map();            // id → { at, tools }
const DISCO_TTL = 10 * 60 * 1000;        // per isolate; a new server shows up fast enough

async function discover(cfg) {
  const hit = discovered.get(cfg.id);
  if (hit && Date.now() - hit.at < DISCO_TTL) return hit.tools;
  let tools = [];
  try {
    const init = await rpc(cfg.url, cfg.token, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {},
                clientInfo: { name: 'duel', version: '1' } },
    });
    if (init.json) {
      await rpc(cfg.url, cfg.token,
        { jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
      const list = await rpc(cfg.url, cfg.token,
        { jsonrpc: '2.0', id: 2, method: 'tools/list' }, init.session);
      const found = list.json && list.json.result && list.json.result.tools;
      if (Array.isArray(found)) {
        tools = found.map(t => t && t.name).filter(n => n && !DENY.test(n));
      }
    }
  } catch { /* unreachable or not speaking MCP — reported as 0 tools */ }
  discovered.set(cfg.id, { at: Date.now(), tools });
  return tools;
}

// Explicit allow-list if one is configured, discovered inventory otherwise.
const toolsFor = cfg =>
  (Array.isArray(cfg.tools) && cfg.tools.length) ? Promise.resolve(cfg.tools) : discover(cfg);

// Models that support the dynamic-filtering web tools. Anything else (Haiku 4.5
// and older) falls back to the basic variants, which every model accepts.
const WEB_MODERN = /^claude-(fable-5|opus-(5|4-8|4-7|4-6)|sonnet-(5|4-6))/;

// Max output tokens, per model. Thinking tokens come out of this same budget on
// the models that reason by default (Fable 5 always, Opus 5 by default), so a
// small ceiling truncates the answer itself rather than the reasoning — you get
// a preamble and nothing else. The current models do 128K; Haiku 4.5 does 64K.
const OUT_128K = /^claude-(fable-5|mythos-5|opus-(5|4-8|4-7|4-6)|sonnet-(5|4-6))/;
const DEFAULT_MAX_TOKENS = 32000;

function clampTokens(v, model) {
  const ceiling = OUT_128K.test(model || '') ? 128000 : 64000;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 256) return Math.min(DEFAULT_MAX_TOKENS, ceiling);
  return Math.min(n, ceiling);
}

// Accepts the current `mcp: ['mnemos', …]` array and the legacy per-server
// booleans (`mnemos: true`) a cached client build may still be sending.
function requestedServers(b, reg) {
  const ids = new Set(Array.isArray(b.mcp) ? b.mcp : []);
  for (const id of Object.keys(reg)) if (b[id] === true) ids.add(id);
  return [...ids].filter(id => reg[id]);
}

const errJson = (message, status) =>
  Response.json({ error: { message } }, { status });

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return errJson('Server is missing ANTHROPIC_API_KEY', 500);

  let b;
  try { b = await request.json(); } catch { return errJson('Invalid JSON body', 400); }
  if (!b || !b.model || !Array.isArray(b.messages)) {
    return errJson('model and messages are required', 400);
  }

  // Build tools server-side from the client's feature flags.
  const tools = [];
  if (b.web) {
    const modern = WEB_MODERN.test(b.model);
    tools.push({
      type: modern ? 'web_search_20260209' : 'web_search_20250305',
      name: 'web_search', max_uses: 5,
    });
    tools.push({
      type: modern ? 'web_fetch_20260209' : 'web_fetch_20250910',
      name: 'web_fetch', max_uses: 5,
      citations: { enabled: true }, max_content_tokens: 50000,
    });
  }

  const reg = registry(env);
  const mcpServers = [];
  for (const id of requestedServers(b, reg)) {
    const cfg = reg[id];
    if (!cfg.url || !cfg.token) continue;   // not wired on this deploy — skip silently
    const allow = await toolsFor(cfg);
    if (!allow.length) continue;            // nothing safe to enable; picker shows why
    mcpServers.push({ type: 'url', url: cfg.url, name: id, authorization_token: cfg.token });
    const configs = {};
    for (const t of allow) configs[t] = { enabled: true };
    tools.push({ type: 'mcp_toolset', mcp_server_name: id, default_config: { enabled: false }, configs });
  }

  const payload = {
    model: b.model,
    max_tokens: clampTokens(b.max_tokens, b.model),
    messages: b.messages,
    stream: true,
  };
  if (b.system) payload.system = b.system;
  if (tools.length) payload.tools = tools;
  if (mcpServers.length) payload.mcp_servers = mcpServers;

  const headers = {
    'content-type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
  if (mcpServers.length) headers['anthropic-beta'] = 'mcp-client-2025-11-20';

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // Stream the SSE (or pass a JSON error) straight through.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'text/event-stream',
      'cache-control': 'no-store',
    },
  });
}

// Drives the client's MCP picker: every server, its label/note, whether it is
// wired up on this deployment, and how many tools it will actually expose.
export async function onRequestGet({ env }) {
  const reg = registry(env);
  const servers = await Promise.all(Object.values(reg).map(async cfg => {
    const ready = Boolean(cfg.url && cfg.token);
    const explicit = Array.isArray(cfg.tools) && cfg.tools.length > 0;
    const tools = ready ? await toolsFor(cfg) : [];
    return {
      id: cfg.id, label: cfg.label, note: cfg.note,
      writes: Boolean(cfg.writes), ready,
      tools: tools.length, discovered: ready && !explicit,
    };
  }));
  servers.sort((a, b) => a.label.localeCompare(b.label));
  return Response.json({ servers });
}
