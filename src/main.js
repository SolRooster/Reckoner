import './style.css';
import { isAuthed, login, logout, handleRedirect } from './bungie/auth.js';
import {
  getCurrentMemberships,
  getProfile,
  getAccountStats,
  getCharacterWeaponStats,
  getItemDefinition,
  getFullProfile,
  setItemLockState,
} from './bungie/api.js';
import { loadItems } from './bungie/manifest.js';
import { loadClarity } from './bungie/clarity.js';
import { gradeGun } from './engine/verdict.js';
import { PERKS_REC, getPerk, setPerkOverrides, isPerkBuiltIn, hasPerkOverride } from './assessment/report.js';
import { AXES, QUESTIONS, SHARED_AXES, MODE_AXES } from './assessment/questions.js';
import { scoreAnswers, archetype, saveProfile, loadProfile } from './assessment/profile.js';
import { buildReport } from './assessment/report.js';
const app = document.querySelector('#app');

// Clarity perk descriptions (lowercased name -> text), loaded at scan time.
let clarityByName = new Map();
// Perk name -> Bungie icon path, captured from the manifest during the scan.
let perkIconByName = new Map();
// The inputs of the most recent vault scan, so the Perk Lab can re-grade
// instantly after the player changes a rating (no refetch needed).
let lastScan = null;

boot();

async function boot() {
  setPerkOverrides(migratePerkOverrides(loadPerkOverrides()));
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

function renderProgress(message) {
  app.innerHTML = `
    <div class="hero">
      <h1 class="wordmark">RECKONER</h1>
      <p class="tagline">${escapeHtml(message)}</p>
      <div class="spinner"></div>
    </div>`;
}

// ---- Milestone 2: the vault read ------------------------------------------

const WEAPON_PERKS_CATEGORY = 4241085061; // "WEAPON PERKS" socket category
const TIER_LEGENDARY = 5;
const WEAPON_ITEM_TYPE = 3;
const ELEMENT_NAME = { 1: 'Kinetic', 2: 'Arc', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' };

async function scanVault(membershipType, membershipId, weaponData) {
  renderProgress('Waking the Cryptarch\u2026');
  try {
    const items = await loadItems((msg) => renderProgress(msg));
    renderProgress('Reading your vault\u2026');
    const [bungieProfile, clarity] = await Promise.all([
      getFullProfile(membershipType, membershipId),
      loadClarity((msg) => renderProgress(msg)).catch(() => new Map()),
    ]);
    clarityByName = clarity;
    const weapons = collectWeapons(bungieProfile, items);
    const characterId =
      Object.keys(bungieProfile.characterInventories?.data ?? {})[0] ||
      Object.keys(bungieProfile.characterEquipment?.data ?? {})[0] ||
      null;
    renderVault(weapons, buildUsageMap(weaponData), loadProfile(), { membershipType, characterId });
  } catch (e) {
    renderError(e.message);
  }
}

function buildUsageMap(weaponData) {
  const map = new Map();
  if (!weaponData) return map;
  const add = (arr) =>
    (arr ?? []).forEach((w) => map.set(w.name, Math.max(map.get(w.name) ?? 0, w.kills)));
  add(weaponData.all);
  (weaponData.perChar ?? []).forEach((c) => add(c.weapons));
  return map;
}

function collectWeapons(profile, items) {
  const stacks = [];
  stacks.push(...(profile.profileInventory?.data?.items ?? []));
  for (const c of Object.values(profile.characterInventories?.data ?? {})) {
    stacks.push(...(c.items ?? []));
  }
  for (const c of Object.values(profile.characterEquipment?.data ?? {})) {
    stacks.push(...(c.items ?? []));
  }

  const socketData = profile.itemComponents?.sockets?.data ?? {};
  const reusableData = profile.itemComponents?.reusablePlugs?.data ?? {};
  const weapons = [];

  for (const it of stacks) {
    if (!it.itemInstanceId) continue;
    const def = items[it.itemHash];
    if (!def || def.itemType !== WEAPON_ITEM_TYPE || def.tier !== TIER_LEGENDARY) continue;
    const socketInfo = socketData[it.itemInstanceId];
    const reusableInfo = reusableData[it.itemInstanceId];
    const { columns, hardware } = readPerks(def, socketInfo, reusableInfo, items);
    const frame = readFrame(def, socketInfo, items);
    const roll = columns.map((col) => col[0]).filter(Boolean); // currently socketed traits
    weapons.push({
      hash: it.itemHash,
      instanceId: it.itemInstanceId,
      name: def.name,
      type: def.typeName,
      frame,
      columns,
      hardware,
      roll,
      icon: def.icon,
      element: ELEMENT_NAME[def.damageType] || '',
      locked: ((it.state || 0) & 1) === 1,
    });
  }
  return weapons;
}

const INTRINSIC_CATEGORY = 3956125808; // "INTRINSIC TRAITS" socket category = the frame

function readFrame(def, socketInfo, items) {
  const cat = (def.socketCategories ?? []).find(
    (c) => c.socketCategoryHash === INTRINSIC_CATEGORY
  );
  const idx = cat?.socketIndexes?.[0];
  if (idx == null) return '';
  const plugHash = socketInfo?.sockets?.[idx]?.plugHash;
  return (plugHash && items[plugHash]?.name) || '';
}

// Enhanced perks are named "{Perk} Enhanced" in the manifest; strip the suffix
// so enhanced and base perks unify into one entry everywhere.
function normalizePerkName(name) {
  return String(name || '').replace(/\s+Enhanced$/i, '').trim();
}

// Plug categories that are tunable hardware (barrel / mag / battery / etc.).
// Origin traits, mods, masterworks and ornaments are deliberately excluded.
const HARDWARE_CATS = ['barrels', 'magazines', 'batteries', 'blades', 'scopes', 'bowstrings', 'arrows', 'grips', 'tubes', 'hafts', 'guards', 'stocks', 'launcher'];

// Reads each weapon socket as the FULL set of available plugs (not just the
// socketed one). Trait columns drive the verdict; hardware columns are read so
// the engine can judge barrel/mag fit silently against the Doctrine.
function readPerks(def, socketInfo, reusableInfo, items) {
  const cat = (def.socketCategories ?? []).find(
    (c) => c.socketCategoryHash === WEAPON_PERKS_CATEGORY
  );
  const indexes = cat?.socketIndexes ?? [];
  const sockets = socketInfo?.sockets ?? [];
  const reusable = reusableInfo?.plugs ?? {};
  const columns = [];
  const hardware = [];

  // Every available plug name in a socket (the full roll pool). Falls back to
  // the socketed plug for fixed random rolls. Names are normalized (the
  // " Enhanced" suffix stripped) so enhanced and base perks unify, and we
  // capture each perk's icon for the Perk Lab.
  const optionsAt = (idx, socketedHash) => {
    let hashes = (reusable[idx] || []).map((p) => p.plugItemHash).filter(Boolean);
    if (!hashes.length && socketedHash) hashes = [socketedHash];
    const ordered = socketedHash ? [socketedHash, ...hashes.filter((h) => h !== socketedHash)] : hashes;
    const out = [];
    const seen = new Set();
    for (const h of ordered) {
      const def = items[h];
      if (!def?.name) continue;
      const name = normalizePerkName(def.name);
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
      if (def.icon && !perkIconByName.has(name)) perkIconByName.set(name, def.icon);
    }
    return out;
  };

  for (const idx of indexes) {
    const socketedHash = sockets[idx]?.plugHash;
    const socketedDef = socketedHash ? items[socketedHash] : null;
    const pc = socketedDef?.plugCategory || '';
    if (pc.includes('trackers')) continue; // skip Kill Tracker noise
    if (pc === 'frames') {
      const names = optionsAt(idx, socketedHash);
      if (names.length) columns.push(names); // the two random trait columns
      continue;
    }
    if (HARDWARE_CATS.some((h) => pc.includes(h))) {
      const names = optionsAt(idx, socketedHash);
      if (names.length) hardware.push(names);
    }
  }
  return { columns, hardware };
}

function renderVault(weapons, usageMap, doctrine, lockCtx) {
  lastScan = { weapons, usageMap, doctrine, lockCtx };
  const byHash = new Map();
  for (const w of weapons) {
    if (!byHash.has(w.hash))
      byHash.set(w.hash, {
        name: w.name,
        type: w.type,
        frame: w.frame,
        icon: w.icon,
        element: w.element,
        copies: [],
      });
    byHash.get(w.hash).copies.push({
      instanceId: w.instanceId,
      columns: w.columns,
      hardware: w.hardware,
      roll: w.roll,
      locked: w.locked,
    });
  }
  const groups = [...byHash.values()];

  // Every distinct perk in the vault — the finite set the Perk Lab lets you rate.
  const perkNames = new Set();
  for (const w of weapons) for (const col of w.columns || []) for (const n of col) perkNames.add(n);
  const unrated = [...perkNames].filter((n) => !getPerk(n)).length;

  // One tile per physical copy, graded as a whole gun.
  const tiles = [];
  for (const g of groups) {
    const { copies } = gradeGun(g, usageMap.get(g.name), doctrine);
    for (const c of copies) {
      tiles.push({
        instanceId: c.instanceId,
        name: g.name,
        frame: g.frame,
        type: g.type,
        icon: g.icon,
        element: g.element,
        rankedColumns: c.rankedColumns || [],
        traits: c.traits || [],
        tier: c.tier,
        verdict: c.verdict,
        why: c.why || '',
        locked: !!c.locked,
      });
    }
  }
  const order = { keep: 0, flex: 1, unsure: 2, shard: 3 };
  tiles.sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name));
  const counts = tiles.reduce((m, t) => ((m[t.tier] = (m[t.tier] || 0) + 1), m), {});

  const doctrineNote = doctrine
    ? `<p class="doctrine-note">Graded against your Doctrine &mdash; PvE: <b>${escapeHtml(
        archetype(doctrine, 'pve')
      )}</b> \u00b7 PvP: <b>${escapeHtml(archetype(doctrine, 'pvp'))}</b></p>`
    : `<p class="doctrine-note subtle">No Doctrine yet &mdash; take the Combat Assessment for verdicts tuned to <i>your</i> playstyle.</p>`;

  const chip = (key, label, n) =>
    `<button class="vfilter${key === 'all' ? ' active' : ''}" data-tier="${key}">${label}${
      n != null ? ` <span class="vfilter-n">${n}</span>` : ''
    }</button>`;

  const distinct = (key) => [...new Set(tiles.map((t) => t[key]).filter(Boolean))].sort();
  const sel = (id, label, opts) =>
    `<select id="${id}" class="vselect"><option value="">${label}</option>${opts
      .map((o) => `<option value="${escapeHtml(o.toLowerCase())}">${escapeHtml(o)}</option>`)
      .join('')}</select>`;

  const lockable = lockCtx && lockCtx.characterId;
  const bulkBar = lockable
    ? `<div class="bulk-bar">
         <button id="lock-keepers" class="btn-secondary">Lock keepers</button>
         <button id="unlock-shards" class="btn-secondary">Unlock shards</button>
         <span id="bulk-status" class="bulk-status"></span>
       </div>
       <p class="subtle bulk-note">Bulk actions only touch what your filters currently show.</p>`
    : `<p class="subtle bulk-note">This sign-in can\u2019t lock items \u2014 enable \u201CMove or equip Destiny items\u201D on your Bungie app, then sign out and back in to prep shards here.</p>`;

  app.innerHTML = `
    <header class="topbar">
      <span class="wordmark small">RECKONER</span>
      <button id="back" class="btn-link">&larr; Back</button>
    </header>
    <section class="dash">
      <h2>Your vault: ${weapons.length} legendary${weapons.length === 1 ? '' : 's'}, ${groups.length} unique.</h2>
      ${doctrineNote}
      <div class="vault-controls">
        <input id="vault-search" class="vault-search" type="search" placeholder="Filter by gun or perk\u2026" />
        ${sel('f-type', 'Weapon Type', distinct('type'))}
        ${sel('f-frame', 'Archetype', distinct('frame'))}
        ${sel('f-element', 'Element', distinct('element'))}
      </div>
      <div class="vfilters">
        ${chip('all', 'All', tiles.length)}
        ${chip('keep', 'Keep', counts.keep || 0)}
        ${chip('flex', 'Flex', counts.flex || 0)}
        ${chip('shard', 'Shard', counts.shard || 0)}
        ${counts.unsure ? chip('unsure', 'Unsure', counts.unsure) : ''}
      </div>
      ${bulkBar}
      <div class="lab-entry"><button id="perk-lab" class="btn-link">⚙ Perk Lab${
        unrated ? ` — ${unrated} perk${unrated === 1 ? '' : 's'} need rating` : ' — all rated'
      }</button></div>
      <div class="tile-grid" id="tile-grid">
        ${tiles.map(vaultTile).join('') || '<p class="subtle">No legendary weapons found.</p>'}
      </div>
    </section>`;

  document.querySelector('#back').addEventListener('click', () => boot());
  document.querySelector('#perk-lab').addEventListener('click', () => renderPerkLab([...perkNames]));

  // ---- filtering ----
  const grid = document.querySelector('#tile-grid');
  const search = document.querySelector('#vault-search');
  const selType = document.querySelector('#f-type');
  const selFrame = document.querySelector('#f-frame');
  const selElement = document.querySelector('#f-element');
  let activeTier = 'all';
  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    const ty = selType.value;
    const fr = selFrame.value;
    const el = selElement.value;
    grid.querySelectorAll('.tile').forEach((node) => {
      const d = node.dataset;
      const ok =
        (activeTier === 'all' || d.tier === activeTier) &&
        (!q || d.name.includes(q) || d.perks.includes(q)) &&
        (!ty || d.type === ty) &&
        (!fr || d.frame === fr) &&
        (!el || d.element === el);
      node.classList.toggle('hidden', !ok);
    });
  };
  search.addEventListener('input', applyFilter);
  [selType, selFrame, selElement].forEach((s) => s.addEventListener('change', applyFilter));
  document.querySelectorAll('.vfilter').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.vfilter').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      activeTier = b.dataset.tier;
      applyFilter();
    })
  );

  // ---- perk detail (Clarity "Community Research" card) ----
  const openFromEvent = (e) => {
    const el = e.target.closest('.perk-click');
    if (!el) return false;
    showPerkCard(el.dataset.name, el.dataset.tier, el.dataset.why);
    return true;
  };
  grid.addEventListener('click', openFromEvent);
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (openFromEvent(e)) e.preventDefault();
    }
  });

  // ---- lock / unlock ----
  if (!lockable) return;
  const tileById = new Map(tiles.map((t) => [t.instanceId, t]));
  const setLockUI = (id, locked) => {
    const t = tileById.get(id);
    if (t) t.locked = locked;
    const btn = grid.querySelector(`.tile-lock[data-id="${id}"]`);
    if (btn) {
      btn.textContent = locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
      btn.title = locked ? 'Locked' : 'Unlocked';
    }
  };
  const statusEl = () => document.querySelector('#bulk-status');

  grid.querySelectorAll('.tile-lock').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const t = tileById.get(id);
      if (!t) return;
      const next = !t.locked;
      btn.disabled = true;
      try {
        await setItemLockState(lockCtx.membershipType, id, lockCtx.characterId, next);
        setLockUI(id, next);
      } catch (e) {
        statusEl().textContent = lockErr(e);
      } finally {
        btn.disabled = false;
      }
    })
  );

  // Bulk acts ONLY on the tiles the current filters are showing.
  const visibleTiles = () =>
    [...grid.querySelectorAll('.tile:not(.hidden)')]
      .map((node) => tileById.get(node.dataset.id))
      .filter(Boolean);

  const runBulk = async (tierTest, state, verb) => {
    const el = statusEl();
    const work = visibleTiles().filter((t) => tierTest(t) && t.locked !== state);
    if (!work.length) {
      el.textContent = `Nothing to ${verb} in this view.`;
      return;
    }
    let done = 0;
    let failed = 0;
    for (const t of work) {
      try {
        await setItemLockState(lockCtx.membershipType, t.instanceId, lockCtx.characterId, state);
        setLockUI(t.instanceId, state);
        done += 1;
      } catch (e) {
        failed += 1;
        if (/scope|permission|access|forbidden|auth/i.test(e.message)) {
          el.textContent = lockErr(e);
          return;
        }
      }
      el.textContent = `${verb === 'lock' ? 'Locking' : 'Unlocking'}\u2026 ${done}/${work.length}${
        failed ? ` (${failed} failed)` : ''
      }`;
    }
    el.textContent = `Done \u2014 ${done} ${state ? 'locked' : 'unlocked'}${failed ? `, ${failed} failed` : ''}.`;
  };
  document
    .querySelector('#lock-keepers')
    .addEventListener('click', () => runBulk((t) => t.tier === 'keep' || t.tier === 'flex', true, 'lock'));
  document
    .querySelector('#unlock-shards')
    .addEventListener('click', () => runBulk((t) => t.tier === 'shard', false, 'unlock'));
}

function lockErr(e) {
  return /scope|permission|access|forbidden|auth/i.test(e.message)
    ? 'Bungie denied lock access \u2014 enable \u201CMove or equip Destiny items\u201D on your Bungie app, then sign out and back in.'
    : `Couldn\u2019t update lock: ${e.message}`;
}

function vaultTile(t) {
  const highlight = t.tier === 'keep' || t.tier === 'flex';
  const recSet = new Set(highlight ? t.traits : []);
  const cols = (t.rankedColumns && t.rankedColumns.length
    ? t.rankedColumns
    : [(t.traits || []).map((name) => ({ name, tier: '', why: '' }))]
  ).filter((c) => c && c.length);
  const perksHtml = cols.length
    ? cols
        .map((col) => `<div class="perk-col">${col.map((pk) => perkChip(pk, recSet)).join('')}</div>`)
        .join('')
    : '<span class="perk">\u2014</span>';
  const allPerks = cols
    .flat()
    .map((pk) => pk.name)
    .join(' ')
    .toLowerCase();
  const img = t.icon
    ? `<img class="tile-img" src="https://www.bungie.net${escapeHtml(t.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
    : '<span class="tile-img tile-img-empty"></span>';
  const lock = t.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
  return `<div class="tile ${t.tier}" data-id="${escapeHtml(t.instanceId)}" data-tier="${t.tier}" data-name="${escapeHtml(
    t.name.toLowerCase()
  )}" data-perks="${escapeHtml(allPerks)}" data-type="${escapeHtml((t.type || '').toLowerCase())}" data-frame="${escapeHtml(
    (t.frame || '').toLowerCase()
  )}" data-element="${escapeHtml((t.element || '').toLowerCase())}">
    <button class="tile-lock" data-id="${escapeHtml(t.instanceId)}" title="${t.locked ? 'Locked' : 'Unlocked'}">${lock}</button>
    <div class="tile-head">
      ${img}
      <div class="tile-headtext">
        <div class="tile-name">${escapeHtml(t.name)}</div>
        <div class="tile-meta">${escapeHtml([t.frame, t.type, t.element].filter(Boolean).join(' \u00b7 '))}</div>
      </div>
    </div>
    <div class="tile-perks">${perksHtml}</div>
    ${t.why ? `<div class="tile-why">${escapeHtml(t.why)}</div>` : ''}
    <div class="tile-verdict ${t.tier}">${escapeHtml(t.verdict)}</div>
  </div>`;
}

function perkChip(pk, recSet) {
  const rec = recSet.has(pk.name) ? ' rec' : '';
  const cls = pk.tier === '?' ? 'tUnknown' : `t${pk.tier}`;
  const tier = pk.tier ? `<span class="perk-tier ${cls}">${escapeHtml(pk.tier)}</span>` : '';
  // The doctrine "why it fits you" stays in the quick-hover title; the full
  // Clarity description lives in the attributed detail card (click/Enter).
  const why = pk.why && pk.tier !== '?' ? pk.why : '';
  const title = why ? ` title="${escapeHtml(why)}"` : '';
  return `<span class="perk perk-click${rec}" role="button" tabindex="0" data-name="${escapeHtml(
    pk.name
  )}" data-tier="${escapeHtml(pk.tier || '')}" data-why="${escapeHtml(why)}"${title}>${escapeHtml(
    pk.name
  )}${tier}</span>`;
}

// Clarity attribution-compliant perk detail card. Clarity's community-written,
// number-backed description is shown under a "Community Research" label and
// credited to Clarity, alongside the engine's doctrine reasoning.
function showPerkCard(name, tier, why) {
  closePerkCard();
  const desc = clarityByName.get((name || '').toLowerCase());
  const badge =
    tier && tier !== '?' ? `<span class="perk-tier t${escapeHtml(tier)}">${escapeHtml(tier)}</span>` : '';
  const research = desc
    ? `<div class="perk-pop-section"><div class="perk-pop-label">Community Research</div><p class="perk-pop-text">${escapeHtml(
        desc
      )}</p></div>`
    : `<div class="perk-pop-section"><p class="perk-pop-text subtle">No community description on file for this perk yet.</p></div>`;
  const forYou = why
    ? `<div class="perk-pop-section"><div class="perk-pop-label for-you">For your Doctrine</div><p class="perk-pop-text">${escapeHtml(
        why
      )}</p></div>`
    : '';
  const el = document.createElement('div');
  el.className = 'perk-pop-backdrop';
  el.id = 'perk-pop';
  el.innerHTML = `
    <div class="perk-pop-card" role="dialog" aria-modal="true">
      <button class="perk-pop-close" aria-label="Close">\u00d7</button>
      <div class="perk-pop-head"><span class="perk-pop-name">${escapeHtml(name)}</span>${badge}</div>
      ${research}
      ${forYou}
      <div class="perk-pop-credit">Community Research by
        <a href="https://d2clarity.com" target="_blank" rel="noopener">Clarity</a></div>
    </div>`;
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.perk-pop-close')) closePerkCard();
  });
  document.body.appendChild(el);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closePerkCard();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function closePerkCard() {
  document.getElementById('perk-pop')?.remove();
}

// ---- Perk Lab: player-rated perk overrides ---------------------------------

const PERK_OVERRIDES_KEY = 'reckoner_perk_overrides';

function loadPerkOverrides() {
  try {
    return JSON.parse(localStorage.getItem(PERK_OVERRIDES_KEY)) || {};
  } catch {
    return {};
  }
}

function savePerkOverrides(map) {
  localStorage.setItem(PERK_OVERRIDES_KEY, JSON.stringify(map));
  setPerkOverrides(map);
}

// One-time migration: fold any "{Perk} Enhanced" ratings onto the base name so
// they aren't orphaned now that perk names are normalized. Base ratings win ties.
function migratePerkOverrides(map) {
  const out = {};
  let changed = false;
  const keys = Object.keys(map).sort(
    (a, b) => (/\sEnhanced$/i.test(a) ? 1 : 0) - (/\sEnhanced$/i.test(b) ? 1 : 0)
  );
  for (const key of keys) {
    const base = normalizePerkName(key);
    if (base !== key) changed = true;
    if (!(base in out)) out[base] = map[key];
  }
  if (changed) localStorage.setItem(PERK_OVERRIDES_KEY, JSON.stringify(out));
  return out;
}

// Best-effort element guess from a Clarity description, so the player doesn't
// have to tag it by hand.
function deriveElement(desc) {
  const d = (desc || '').toLowerCase();
  for (const el of ['stasis', 'strand', 'arc', 'solar', 'void']) {
    if (d.includes(el)) return el;
  }
  return undefined;
}

const LAB_ROLES = ['addclear', 'dps', 'survival', 'economy', 'utility'];
const ROLE_LABEL = { addclear: 'Add-clear', dps: 'DPS', survival: 'Survival', economy: 'Economy', utility: 'Utility' };
const LAB_POWER = ['None', 'Situational', 'Strong', 'Top'];

function renderPerkLab(names) {
  const overrides = loadPerkOverrides();
  const rated = (n) => !!getPerk(n);
  const sorted = [...new Set(names)].sort(
    (a, b) => (rated(a) ? 1 : 0) - (rated(b) ? 1 : 0) || a.localeCompare(b)
  );
  const needRating = sorted.filter((n) => !rated(n)).length;

  const powerSel = (name, field, val) =>
    `<select class="lab-input" data-field="${field}">${LAB_POWER.map(
      (label, v) => `<option value="${v}"${v === val ? ' selected' : ''}>${label}</option>`
    ).join('')}</select>`;
  const roleSel = (val) =>
    `<select class="lab-input" data-field="role"><option value="">Role\u2026</option>${LAB_ROLES.map(
      (r) => `<option value="${r}"${r === val ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`
    ).join('')}</select>`;

  const row = (name) => {
    const cur = overrides[name] || getPerk(name) || {};
    const source = hasPerkOverride(name) ? 'yours' : isPerkBuiltIn(name) ? 'built-in' : 'unrated';
    const desc = clarityByName.get(name.toLowerCase()) || 'No community description on file.';
    const icon = perkIconByName.get(name);
    return `<div class="lab-row source-${source}" data-name="${escapeHtml(name)}">
      <div class="lab-top">
        <span class="lab-perk-head">${
          icon
            ? `<img class="lab-icon" src="https://www.bungie.net${escapeHtml(
                icon
              )}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
            : ''
        }<span class="lab-name">${escapeHtml(name)}</span></span>
        <span class="lab-source">${source}</span>
      </div>
      <p class="lab-desc">${escapeHtml(desc)}</p>
      <div class="lab-controls">
        <label>PvE ${powerSel(name, 'pve', cur.pve ?? 0)}</label>
        <label>PvP ${powerSel(name, 'pvp', cur.pvp ?? 0)}</label>
        ${roleSel(cur.role || '')}
        <label class="lab-check"><input type="checkbox" class="lab-input" data-field="build"${
          cur.build ? ' checked' : ''
        }/> Build</label>
      </div>
    </div>`;
  };

  app.innerHTML = `
    <header class="topbar">
      <span class="wordmark small">RECKONER</span>
      <button id="lab-back" class="btn-link">&larr; Back to vault</button>
    </header>
    <section class="dash">
      <h2>Perk Lab</h2>
      <p class="subtle">Rate any perk in your vault and it overrides my model everywhere. ${needRating} of ${sorted.length} still need a rating — unrated ones are up top. Changes save instantly; “Apply” re-grades your vault.</p>
      <details class="lab-legend">
        <summary>How to rate — tiers &amp; roles</summary>
        <div class="lab-legend-body">
          <p><b>Power</b> (PvE &amp; PvP) — rate as if the perk is on a weapon that uses it well; weapon rarity doesn’t lower it.</p>
          <ul>
            <li><b>None</b> — does nothing useful in this mode.</li>
            <li><b>Situational</b> — works only in a specific situation or setup, or a minor benefit.</li>
            <li><b>Strong</b> — reliable, high-value; a real god-roll contender.</li>
            <li><b>Top</b> — best-in-class; defines the gun for this mode.</li>
          </ul>
          <p><b>Role</b> — the perk’s main job (pick the dominant one):</p>
          <ul>
            <li><b>Add-clear</b> — kills or clears groups of minor enemies.</li>
            <li><b>DPS</b> — primarily boosts damage numbers.</li>
            <li><b>Survival</b> — keeps you alive, including protective crowd-control (blind, freeze, suppress).</li>
            <li><b>Economy</b> — feeds the gun (ammo) or feeds your build (orbs / elemental pickups).</li>
            <li><b>Utility</b> — gunfeel, aim and positioning (stability, range, handling, ADS).</li>
          </ul>
          <p><b>Build</b> — toggle on when the perk fuels a subclass or ability loop (Architect synergy).</p>
        </div>
      </details>
      <input id="lab-search" class="vault-search" type="search" placeholder="Find a perk…" />
      <div class="lab-list" id="lab-list">${sorted.map(row).join('')}</div>
      <div class="bulk-bar"><button id="lab-apply" class="btn-primary">Apply &amp; re-grade</button></div>
    </section>`;

  const list = document.querySelector('#lab-list');
  list.addEventListener('change', (e) => {
    const r = e.target.closest('.lab-row');
    if (!r) return;
    const name = r.dataset.name;
    const val = (f) => r.querySelector(`[data-field="${f}"]`);
    const desc = clarityByName.get(name.toLowerCase());
    const element = deriveElement(desc);
    overrides[name] = {
      pve: Number(val('pve').value),
      pvp: Number(val('pvp').value),
      role: val('role').value || 'utility',
      build: val('build').checked,
      ...(element ? { element } : {}),
    };
    savePerkOverrides(overrides);
    r.classList.remove('source-unrated', 'source-built-in');
    r.classList.add('source-yours');
    r.querySelector('.lab-source').textContent = 'yours';
  });

  document.querySelector('#lab-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    list.querySelectorAll('.lab-row').forEach((r) => {
      r.classList.toggle('hidden', !!q && !r.dataset.name.toLowerCase().includes(q));
    });
  });

  document.querySelector('#lab-back').addEventListener('click', () => applyLabAndReturn());
  document.querySelector('#lab-apply').addEventListener('click', () => applyLabAndReturn());
}

function applyLabAndReturn() {
  if (lastScan) {
    renderVault(lastScan.weapons, lastScan.usageMap, lastScan.doctrine, lastScan.lockCtx);
  } else {
    boot();
  }
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
  const characters = buildCharacters(profile);
  const weaponData = await gatherWeapons(membershipType, membershipId, characters);

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

      <div class="profile-banner" id="profile-banner"></div>

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
      <div class="weapon-tabs" id="weapon-tabs"></div>
      <ol class="weapon-list" id="weapon-list"></ol>

      <div class="next">
        <button id="scan" class="btn-primary">Scan my vault &rarr;</button>
        <p class="subtle">Reads every legendary in your vault and lays its roll bare.</p>
      </div>
    </section>`;

  document.querySelector('#logout').addEventListener('click', () => {
    logout();
    location.href = redirectHome();
  });

  document
    .querySelector('#scan')
    .addEventListener('click', () => scanVault(membershipType, membershipId, weaponData));

  renderProfileBanner();
  setupWeaponTabs(weaponData);
}

// ---- Combat Assessment ("Doctrine") ---------------------------------------

function renderProfileBanner() {
  const el = document.querySelector('#profile-banner');
  if (!el) return;
  const profile = loadProfile();
  if (profile) {
    el.innerHTML = `
      <span class="pb-label">Combat Doctrine:</span>
      <span class="pb-archetype">PvE \u00b7 ${escapeHtml(archetype(profile, 'pve'))}</span>
      <span class="pb-archetype">PvP \u00b7 ${escapeHtml(archetype(profile, 'pvp'))}</span>
      <button id="view-doctrine" class="btn-link">View</button>
      <button id="take-assessment" class="btn-link">Retake</button>`;
    el.querySelector('#view-doctrine').addEventListener('click', () => renderProfileResult(profile));
  } else {
    el.innerHTML = `
      <span class="pb-label">No combat profile yet.</span>
      <button id="take-assessment" class="btn-pill">Take the Combat Assessment &rarr;</button>`;
  }
  el.querySelector('#take-assessment').addEventListener('click', () => renderQuestion(0, []));
}

const SECTION_LABEL = { shared: 'Identity', pve: 'PvE', pvp: 'PvP' };

function renderQuestion(index, answers) {
  if (index >= QUESTIONS.length) {
    const profile = scoreAnswers(answers);
    saveProfile(profile);
    return renderProfileResult(profile);
  }
  const q = QUESTIONS[index];
  app.innerHTML = `
    <section class="quiz">
      <div class="quiz-progress">${SECTION_LABEL[q.section] || ''} \u00b7 Question ${
        index + 1
      } of ${QUESTIONS.length}</div>
      <div class="quiz-bar"><div class="quiz-fill" style="width:${
        ((index + 1) / QUESTIONS.length) * 100
      }%"></div></div>
      <h2 class="quiz-q">${escapeHtml(q.q)}</h2>
      <div class="quiz-options">
        ${q.options
          .map((o, i) => `<button class="quiz-option" data-i="${i}">${escapeHtml(o.text)}</button>`)
          .join('')}
      </div>
    </section>`;
  app.querySelectorAll('.quiz-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const opt = q.options[Number(btn.dataset.i)];
      renderQuestion(index + 1, [...answers, { section: q.section, axis: opt.axis, focus: opt.focus }]);
    });
  });
}

function axisBar(label, ax, pos) {
  return `<div class="axis">
    <div class="axis-poles"><span>${escapeHtml(ax.a)}</span><span class="axis-name">${escapeHtml(
      label
    )}</span><span>${escapeHtml(ax.b)}</span></div>
    <div class="axis-track"><div class="axis-dot" style="left:${100 - pos}%"></div></div>
  </div>`;
}

function modeBlock(profile, mode) {
  const title = mode === 'pve' ? 'PvE Doctrine' : 'PvP Doctrine';
  const report = buildReport(profile, mode);
  const modeBars = MODE_AXES.map((k) => axisBar(AXES[k].desc, AXES[k], profile[mode][k])).join('');
  const frames = report.frames.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
  const seek = report.seek
    .map((p) => `<li><span class="perk-yes">${escapeHtml(p.name)}</span> &mdash; ${escapeHtml(p.why)}</li>`)
    .join('') || '<li class="subtle">No standout chase perks \u2014 you\u2019re flexible here.</li>';
  const avoid = report.avoid
    .map((p) => `<li><span class="perk-no">${escapeHtml(p.name)}</span> &mdash; ${escapeHtml(p.why)}</li>`)
    .join('') || '<li class="subtle">Nothing actively works against you.</li>';
  return `<div class="mode-block">
    <div class="mode-head"><span class="mode-tag">${title}</span>
      <span class="mode-arch">${escapeHtml(archetype(profile, mode))}</span></div>
    ${report.focusLabel ? `<div class="focus-tag">Focus &middot; ${escapeHtml(report.focusLabel)}</div>` : ''}
    <p class="mode-summary">${escapeHtml(report.summary)}</p>
    <div class="axes">${modeBars}</div>
    <h4>Frames that fit you</h4><ul class="rec-list">${frames}</ul>
    <h4>Perks to chase</h4><ul class="rec-list">${seek}</ul>
    <h4>Perks to avoid</h4><ul class="rec-list">${avoid}</ul>
  </div>`;
}

function renderProfileResult(profile) {
  const identity = SHARED_AXES.map((k) => axisBar(AXES[k].desc, AXES[k], profile.shared[k])).join('');
  app.innerHTML = `
    <header class="topbar">
      <span class="wordmark small">RECKONER</span>
      <button id="done" class="btn-link">&larr; Back</button>
    </header>
    <section class="dash">
      <p class="subtle">Your Combat Doctrine</p>
      <h3>Identity <span class="subtle">(holds in any mode)</span></h3>
      <div class="axes">${identity}</div>
      ${modeBlock(profile, 'pve')}
      ${modeBlock(profile, 'pvp')}
      <p class="next subtle">Reckoner will weigh your vault verdicts toward this profile next.</p>
      <button id="done2" class="btn-primary">Back to the record</button>
    </section>`;
  document.querySelector('#done').addEventListener('click', () => boot());
  document.querySelector('#done2').addEventListener('click', () => boot());
}

function setupWeaponTabs(weaponData) {
  const tabsEl = document.querySelector('#weapon-tabs');
  const listEl = document.querySelector('#weapon-list');
  if (!tabsEl || !listEl) return;

  const views = [{ label: 'All', weapons: weaponData.all }, ...weaponData.perChar];

  tabsEl.innerHTML = views
    .map(
      (v, i) =>
        `<button class="weapon-tab${i === 0 ? ' active' : ''}" data-idx="${i}">${escapeHtml(v.label)}</button>`
    )
    .join('');

  const render = (idx) => {
    listEl.innerHTML =
      views[idx].weapons.map(weaponRow).join('') ||
      '<li class="subtle">No weapon data for this class yet.</li>';
  };

  tabsEl.querySelectorAll('.weapon-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabsEl.querySelectorAll('.weapon-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      render(Number(btn.dataset.idx));
    });
  });

  render(0);
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

const CLASS_LABELS = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

function buildCharacters(profile) {
  const data = profile?.characters?.data ?? {};
  return Object.values(data)
    .map((c) => ({
      characterId: c.characterId,
      label: CLASS_LABELS[c.classType] ?? 'Guardian',
      lastPlayed: c.dateLastPlayed ? Date.parse(c.dateLastPlayed) : 0,
    }))
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
}

async function gatherWeapons(membershipType, membershipId, characters) {
  const raw = await Promise.all(
    characters.map(async (c) => {
      const stats = await getCharacterWeaponStats(
        membershipType,
        membershipId,
        c.characterId
      ).catch(() => null);
      const weapons = (stats?.weapons ?? [])
        .map((w) => ({
          hash: w.referenceId,
          kills: Math.round(w?.values?.uniqueWeaponKills?.basic?.value ?? 0),
        }))
        .filter((w) => w.hash);
      return { label: c.label, weapons };
    })
  );

  // Group by class label (handles multiple characters of the same class).
  const byLabel = new Map(); // label -> Map(hash -> kills)
  const merged = new Map(); //  hash -> kills (all classes combined)
  for (const c of raw) {
    if (!byLabel.has(c.label)) byLabel.set(c.label, new Map());
    const m = byLabel.get(c.label);
    for (const w of c.weapons) {
      m.set(w.hash, (m.get(w.hash) ?? 0) + w.kills);
      merged.set(w.hash, (merged.get(w.hash) ?? 0) + w.kills);
    }
  }

  // Resolve every weapon hash to a name exactly once.
  const names = new Map();
  await Promise.all(
    [...merged.keys()].map(async (hash) => {
      try {
        const def = await getItemDefinition(hash);
        names.set(hash, def?.displayProperties?.name || `Item ${hash}`);
      } catch {
        names.set(hash, `Item ${hash}`);
      }
    })
  );

  const topNamed = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hash, kills]) => ({ name: names.get(hash) || `Item ${hash}`, kills }));

  return {
    all: topNamed(merged),
    perChar: [...byLabel.entries()].map(([label, map]) => ({
      label,
      weapons: topNamed(map),
    })),
  };
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
