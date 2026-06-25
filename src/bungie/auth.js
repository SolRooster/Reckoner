// Bungie OAuth (Authorization Code flow).
// The browser only ever holds the public CLIENT_ID and the resulting access
// token. The code->token exchange runs in the Worker so the client SECRET and
// API key never touch the browser.
import { CONFIG, redirectUri } from './config.js';

const AUTHORIZE_URL = 'https://www.bungie.net/en/OAuth/Authorize';
const TOKEN_KEY = 'reckoner_token';
const STATE_KEY = 'reckoner_oauth_state';

export function getToken() {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isAuthed() {
  const t = getToken();
  return !!(t && t.access_token && Date.now() < t.expires_at);
}

export function login() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    response_type: 'code',
    state,
  });
  location.href = `${AUTHORIZE_URL}?${params}`;
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
}

// If we just came back from Bungie with ?code=..., exchange it for a token.
// Returns true if a sign-in was completed on this load.
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code) return false;

  const expected = sessionStorage.getItem(STATE_KEY);
  if (!state || state !== expected) {
    throw new Error('OAuth state mismatch — sign-in aborted for safety.');
  }
  sessionStorage.removeItem(STATE_KEY);

  const resp = await fetch(`${CONFIG.WORKER_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, grant_type: 'authorization_code' }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error('Token exchange failed. Check the Worker config.');
  }

  const token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    membership_id: data.membership_id || null,
    expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));

  // Strip the ?code from the address bar.
  history.replaceState({}, '', redirectUri());
  return true;
}
