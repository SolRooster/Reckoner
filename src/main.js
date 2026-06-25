import './style.css';
import { isAuthed, login, logout, handleRedirect } from './bungie/auth.js';
import {
  getCurrentMemberships,
  getProfile,
  getAccountStats,
  getCharacterWeaponStats,
  getItemDefinition,
} from './bungie/api.js';

const app = document.querySelector('#app');

boot();

async function boot() {
  try {
    await handleRedirect();
  } catch (e) {
    return renderError(e.message);
  }

  if (!isAuthed()) return renderLanding();

  renderLoading();
  try {
    await renderDashboard();
  } catch (e) {
    renderError(e.message);
  }
}

function renderLanding() {
  app.innerHTML = `
    <div class="hero">
      <h1 class="wordmark">RECKONER</h1>
      <p class="tagline">Drag your vault into the light.<br />Keep what matters. Shard the rest.</p>
      <button id="connect" class="btn-primary">Connect Bungie Account</button>
      <p class="fine">Reckoner reads your stats and gear through Bungie's official API.
      It never sees your password, and nothing is stored on a server.</p>
    </div>`;
  document.querySelector('#connect').addEventListener('click', login);
}

function renderLoading() {
  app.innerHTML = `
    <div class="hero">
      <h1 class="wordmark">RECKONER</h1>
      <p class="tagline">Reading your record…</p>
      <div class="spinner"></div>
    </div>`;
}

function renderError(message) {
  app.innerHTML = `
    <div class="hero">
      <h1 class="wordmark">RECKONER</h1>
      <p class="error">${escapeHtml(message)}</p>
      <button id="retry" class="btn-secondary">Start over</button>
    </div>`;
  document.querySelector('#retry').addEventListener('click', () => {
    logout();
    location.href = redirectHome();
  });
}

// ---- Milestone 1: the API spills your secrets -----------------------------

async function renderDashboard() {
  const memberships = await getCurrentMemberships();
  const member = pickPrimaryMembership(memberships);
  if (!member) throw new Error('No Destiny 2 account found on this Bungie profile.');

  const { membershipType, membershipId } = member;

  const [profile, accountStats] = await Promise.all([
    getProfile(membershipType, membershipId, [100, 200]),
    getAccountStats(membershipType, membershipId),
  ]);

  const split = computeModeSplit(accountStats);
  const characterIds = Object.keys(profile?.characters?.data ?? {});
  const topWeapons = await computeTopWeapons(membershipType, membershipId, characterIds);

  const displayName =
    memberships?.bungieNetUser?.uniqueName ||
    member.displayName ||
    'Guardian';

  app.innerHTML = `
    <header class="topbar">
      <span class="wordmark small">RECKONER</span>
      <button id="logout" class="btn-link">Sign out</button>
    </header>

    <section class="dash">
      <h2>${escapeHtml(displayName)}, here's the honest record.</h2>

      <div class="split-card">
        <div class="split-row">
          <span class="split-label">PvE</span>
          <div class="split-bar"><div class="split-fill pve" style="width:${split.pvePct}%"></div></div>
          <span class="split-pct">${split.pvePct}%</span>
        </div>
        <div class="split-row">
          <span class="split-label">PvP</span>
          <div class="split-bar"><div class="split-fill pvp" style="width:${split.pvpPct}%"></div></div>
          <span class="split-pct">${split.pvpPct}%</span>
        </div>
        <p class="split-note">${escapeHtml(split.verdict)}</p>
      </div>

      <div class="stat-grid">
        <div class="stat"><span class="stat-num">${split.pveHours}</span><span class="stat-cap">PvE hours</span></div>
        <div class="stat"><span class="stat-num">${split.pvpHours}</span><span class="stat-cap">PvP hours</span></div>
        <div class="stat"><span class="stat-num">${split.pvpKd}</span><span class="stat-cap">Crucible K/D</span></div>
      </div>

      <h3>Most-used weapons <span class="subtle">(what you actually reach for)</span></h3>
      <ol class="weapon-list">
        ${topWeapons.map(weaponRow).join('') || '<li class="subtle">No weapon data returned.</li>'}
      </ol>

      <p class="next">Next stop: pull your vault and start the reckoning.</p>
    </section>`;

  document.querySelector('#logout').addEventListener('click', () => {
    logout();
    location.href = redirectHome();
  });
}

function weaponRow(w) {
  return `<li>
    <span class="weapon-name">${escapeHtml(w.name)}</span>
    <span class="weapon-kills">${w.kills.toLocaleString()} kills</span>
  </li>`;
}

// ---- data crunching --------------------------------------------------------

function pickPrimaryMembership(memberships) {
  const list = memberships?.destinyMemberships ?? [];
  if (!list.length) return null;
  const primaryId = memberships.primaryMembershipId;
  return list.find((m) => m.membershipId === primaryId) ?? list[0];
}

function computeModeSplit(accountStats) {
  const results = accountStats?.mergedAllCharacters?.results ?? {};
  const pveSecs = secondsPlayed(results.allPvE);
  const pvpSecs = secondsPlayed(results.allPvP);
  const total = pveSecs + pvpSecs || 1;
  const pvePct = Math.round((pveSecs / total) * 100);
  const pvpPct = 100 - pvePct;
  const pvpKd = round2(statValue(results.allPvP, 'killsDeathsRatio'));

  return {
    pvePct,
    pvpPct,
    pveHours: Math.round(pveSecs / 3600).toLocaleString(),
    pvpHours: Math.round(pvpSecs / 3600).toLocaleString(),
    pvpKd: pvpKd ? pvpKd.toFixed(2) : '—',
    verdict: splitVerdict(pvePct, pvpPct),
  };
}

function splitVerdict(pve, pvp) {
  if (pvp >= 40) return `You called it 80/20, but you're really ${pve}/${pvp}. You PvP more than you admit.`;
  if (pvp <= 12) return `Even more PvE-heavy than you thought — ${pve}/${pvp}.`;
  return `Close to your gut call: ${pve}/${pvp}.`;
}

function secondsPlayed(modeBlock) {
  return statValue(modeBlock, 'secondsPlayed');
}

function statValue(modeBlock, key) {
  const v = modeBlock?.allTime?.[key]?.basic?.value;
  return typeof v === 'number' ? v : 0;
}

async function computeTopWeapons(membershipType, membershipId, characterIds) {
  const tallies = new Map(); // referenceId -> kills

  const perChar = await Promise.all(
    characterIds.map((cid) =>
      getCharacterWeaponStats(membershipType, membershipId, cid).catch(() => null)
    )
  );

  for (const stats of perChar) {
    const weapons = stats?.weapons ?? [];
    for (const w of weapons) {
      const id = w.referenceId;
      const kills = w?.values?.uniqueWeaponKills?.basic?.value ?? 0;
      if (!id) continue;
      tallies.set(id, (tallies.get(id) ?? 0) + kills);
    }
  }

  const top = [...tallies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const named = await Promise.all(
    top.map(async ([hash, kills]) => {
      let name = `Item ${hash}`;
      try {
        const def = await getItemDefinition(hash);
        name = def?.displayProperties?.name || name;
      } catch {
        /* leave fallback name */
      }
      return { hash, kills: Math.round(kills), name };
    })
  );
  return named;
}

// ---- helpers ---------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function redirectHome() {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
