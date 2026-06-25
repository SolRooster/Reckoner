// Thin wrapper over the Bungie Platform API, routed through the Worker so the
// API key stays server-side. Every helper returns the unwrapped `.Response`.
import { CONFIG } from './config.js';
import { getToken } from './auth.js';

async function bungie(path, { auth = true, method = 'GET', body } = {}) {
  const headers = {};
  if (auth) {
    const t = getToken();
    if (t?.access_token) headers['Authorization'] = `Bearer ${t.access_token}`;
  }
  const init = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${CONFIG.WORKER_URL}/api/${path}`, init);
  const data = await resp.json();
  if (data.ErrorCode && data.ErrorCode !== 1) {
    throw new Error(`Bungie API: ${data.Message || data.ErrorStatus || 'unknown error'}`);
  }
  return data.Response;
}

// Who is signed in, and which Destiny memberships do they have?
export function getCurrentMemberships() {
  return bungie('User/GetMembershipsForCurrentUser/');
}

// Profile + characters. components is an array of numeric component ids.
// 100 = profiles, 200 = characters, 102 = profile inventory (vault),
// 201 = character inventories, 205 = equipment, 300 = instances, 305 = sockets.
export function getProfile(membershipType, membershipId, components) {
  const q = components.join(',');
  return bungie(`Destiny2/${membershipType}/Profile/${membershipId}/?components=${q}`);
}

// Everything needed to read every weapon and its rolled perks.
export function getFullProfile(membershipType, membershipId) {
  return getProfile(membershipType, membershipId, [102, 201, 205, 300, 305]);
}

// Lifetime historical stats merged across all characters (PvE / PvP split).
export function getAccountStats(membershipType, membershipId) {
  return bungie(`Destiny2/${membershipType}/Account/${membershipId}/Stats/`);
}

// Per-character weapon usage (kills, precision) for the "most used" board.
export function getCharacterWeaponStats(membershipType, membershipId, characterId) {
  return bungie(
    `Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/UniqueWeapons/`
  );
}

// Resolve a single item hash to its definition (name, type, icon).
// Public manifest entity — no user auth needed; the Worker adds the API key.
export function getItemDefinition(hash) {
  return bungie(`Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`, { auth: false });
}
