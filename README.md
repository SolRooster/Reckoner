# Reckoner

Drag your Destiny 2 vault into the light. Reckoner reads your real playstyle and
gear through Bungie's official API, then tells you what to **keep** and what to
**shard** — in your voice, not a generic tier list.

## Architecture

```
Browser (Vite + vanilla JS, GitHub Pages)
  -> reckoner-bungie Worker (Cloudflare)  [holds API key + client secret]
    -> Bungie Platform API
```

The browser only ever holds the public OAuth `client_id` and the resulting
access token. The API key and client secret live exclusively in the Worker.

## Milestones

1. **The API spills your secrets** — real PvE/PvP split, K/D, top-used weapons. ← current
2. **Vault read** — pull every gun and its rolled perks.
3. **The verdict engine** — stylized Keep / Shard cards tuned to your playstyle.

## Setup

1. Create a Bungie app at https://www.bungie.net/en/Application
   - OAuth Client Type: **Confidential**
   - Redirect URL: `https://solrooster.github.io/Reckoner/`
   - Scopes: read your Destiny inventory and account data
2. Fill `src/bungie/config.js` with the OAuth `client_id` and your Worker URL.
3. Deploy the Worker (`worker/`) and set its secrets:
   `BUNGIE_API_KEY`, `BUNGIE_CLIENT_ID`, `BUNGIE_CLIENT_SECRET`.
4. `npm install` then `npm run dev`.

## Stack

Vite + vanilla JS frontend, Cloudflare Worker proxy, deployed to GitHub Pages.
