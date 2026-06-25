// Reckoner Bungie proxy Worker.
// Holds the secrets (API key + OAuth client secret) and brokers two things:
//   1. POST /oauth/token  — exchanges an auth code (or refresh token) for an access token
//   2. /api/*             — forwards GET/POST calls to the Bungie Platform API,
//                           injecting the X-API-Key header server-side
//
// Secrets (set in the Cloudflare dashboard or `wrangler secret put`):
//   BUNGIE_API_KEY        (secret)
//   BUNGIE_CLIENT_ID      (secret or var — the OAuth client id)
//   BUNGIE_CLIENT_SECRET  (secret)
//   ALLOWED_ORIGIN        (var — comma-separated allowlist of site origins)

const BUNGIE = 'https://www.bungie.net';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN || '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/oauth/token' && request.method === 'POST') {
        return await handleToken(request, env, cors);
      }
      if (url.pathname.startsWith('/api/')) {
        return await handleApiProxy(request, env, cors, url);
      }
      return json({ error: 'not_found' }, 404, cors);
    } catch (err) {
      return json({ error: 'worker_error', detail: String(err) }, 500, cors);
    }
  },
};

function corsHeaders(origin, allowedCsv) {
  const allowed = allowedCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function handleToken(request, env, cors) {
  const payload = await request.json().catch(() => ({}));
  const body = new URLSearchParams();

  if (payload.grant_type === 'refresh_token' && payload.refresh_token) {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', payload.refresh_token);
  } else if (payload.code) {
    body.set('grant_type', 'authorization_code');
    body.set('code', payload.code);
  } else {
    return json({ error: 'missing_code' }, 400, cors);
  }
  body.set('client_id', env.BUNGIE_CLIENT_ID);
  body.set('client_secret', env.BUNGIE_CLIENT_SECRET);

  const resp = await fetch(`${BUNGIE}/Platform/App/OAuth/Token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-API-Key': env.BUNGIE_API_KEY,
    },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  return json(data, resp.status, cors);
}

async function handleApiProxy(request, env, cors, url) {
  // Everything after /api/ is appended to the Bungie Platform root.
  const path = url.pathname.replace(/^\/api\//, '');
  const target = `${BUNGIE}/Platform/${path}${url.search}`;

  const headers = { 'X-API-Key': env.BUNGIE_API_KEY };
  const auth = request.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = await request.text();
  }

  const resp = await fetch(target, init);
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
