// Reckoner config.
// CLIENT_ID is the OAuth client id from your Bungie app — it is PUBLIC and safe
// to ship in the browser. The API key and client SECRET live only in the Worker.
export const CONFIG = {
  // From https://www.bungie.net/en/Application  (OAuth client_id)
  CLIENT_ID: '53273',

  // Your deployed Cloudflare Worker base URL, no trailing slash.
  // e.g. https://reckoner-bungie.roster-support.workers.dev
  WORKER_URL: 'https://reckoner-bungie.roster-support.workers.dev',
};

// The OAuth redirect lands back on this exact URL. Must match the redirect URL
// registered on your Bungie app (including the trailing slash).
// In production this resolves to https://solrooster.github.io/Reckoner/
export function redirectUri() {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}
