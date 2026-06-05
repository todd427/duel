// Cloudflare Pages Function — server-side proxy for Duel.
//
// The browser sends only the conversation + feature flags; this function
// injects the secrets (Anthropic key, Mnemos/Rialú MCP tokens) and the
// tool definitions, calls the Anthropic Messages API, and streams the SSE
// response straight back. Nothing sensitive ever reaches the client.
//
// Configure in the Cloudflare Pages project → Settings → Environment variables
// (encrypted): ANTHROPIC_API_KEY, MNEMOS_MCP_TOKEN, RIALU_MCP_TOKEN.
// Access is already gated by Cloudflare Access in front of the site.

const MCP = {
  mnemos: {
    url: 'https://mnemos.foxxelabs.ie/mcp',
    tokenVar: 'MNEMOS_MCP_TOKEN',
    readonly: ['query_memory', 'get_belief_context', 'get_stats', 'get_doc_count', 'list_filters'],
  },
  rialu: {
    url: 'https://rialu.ie/mcp',
    tokenVar: 'RIALU_MCP_TOKEN',
    readonly: ['list_projects', 'get_project'],
  },
};

function clampTokens(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 256) return 4096;
  return Math.min(n, 64000);
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
    tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    tools.push({
      type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5,
      citations: { enabled: true }, max_content_tokens: 50000,
    });
  }

  const mcpServers = [];
  for (const id of ['mnemos', 'rialu']) {
    if (!b[id]) continue;
    const cfg = MCP[id];
    const token = env[cfg.tokenVar];
    if (!token) continue;  // requested but not configured on the server — skip silently
    mcpServers.push({ type: 'url', url: cfg.url, name: id, authorization_token: token });
    const configs = {};
    for (const t of cfg.readonly) configs[t] = { enabled: true };   // read-only allow-list
    tools.push({ type: 'mcp_toolset', mcp_server_name: id, default_config: { enabled: false }, configs });
  }

  const payload = {
    model: b.model,
    max_tokens: clampTokens(b.max_tokens),
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
