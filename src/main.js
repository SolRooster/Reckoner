import './style.css';
import { isAuthed, login, logout, handleRedirect } from './bungie/auth.js';
import {
  getCurrentMemberships,
  getProfile,
  getAccountStats,
  getCharacterWeaponStats,
  getItemDefinition,
  getFullProfile,
} from './bungie/api.js';
import { loadItems } from './bungie/manifest.js';
import { gradeGun } from './engine/verdict.js';
import { AXES, QUESTIONS, SHARED_AXES, MODE_AXES } from './assessment/questions.js';
import { scoreAnswers, archetype, saveProfile, loadProfile } from './assessment/profile.js';
import { buildReport } from './assessment/report.js';

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

async function scanVault(membershipType, membershipId, weaponData) {
  renderProgress('Waking the Cryptarch\u2026');
  try {
    const items = await loadItems((msg) => renderProgress(msg));
    renderProgress('Reading your vault\u2026');
    const profile = await getFullProfile(membershipType, membershipId);
    const weapons = collectWeapons(profile, items);
    renderVault(weapons, buildUsageMap(weaponData));
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
  const weapons = [];

  for (const it of stacks) {
    if (!it.itemInstanceId) continue;
    const def = items[it.itemHash];
    if (!def || def.itemType !== WEAPON_ITEM_TYPE || def.tier !== TIER_LEGENDARY) continue;
    const perks = readPerks(def, socketData[it.itemInstanceId], items);
    weapons.push({ hash: it.itemHash, name: def.name, type: def.typeName, perks });
  }
  return weapons;
}

function readPerks(def, socketInfo, items) {
  const cat = (def.socketCategories ?? []).find(
    (c) => c.socketCategoryHash === WEAPON_PERKS_CATEGORY
  );
  const indexes = cat?.socketIndexes ?? [];
  const sockets = socketInfo?.sockets ?? [];
  const traits = [];
  const extras = [];
  for (const idx of indexes) {
    const plugHash = sockets[idx]?.plugHash;
    if (!plugHash) continue;
    const pdef = items[plugHash];
    if (!pdef?.name) continue;
    const pc = pdef.plugCategory || '';
    if (pc.includes('trackers')) continue; // skip Kill Tracker noise
    if (pc === 'frames') traits.push(pdef.name); // the two random trait columns
    else extras.push(pdef.name); // barrel / mag / battery / origin
  }
  return { traits, extras };
}

function renderVault(weapons, usageMap) {
  const byHash = new Map();
  for (const w of weapons) {
    if (!byHash.has(w.hash)) byHash.set(w.hash, { name: w.name, type: w.type, copies: [] });
    byHash.get(w.hash).copies.push(w.perks);
  }
  const groups = [...byHash.values()].sort((a, b) => b.copies.length - a.copies.length);
  const graded = groups.map((g) => ({ group: g, ...gradeGun(g, usageMap.get(g.name)) }));

  app.innerHTML = `
    <header class="topbar">
      <span class="wordmark small">RECKONER</span>
      <button id="back" class="btn-link">&larr; Back</button>
    </header>
    <section class="dash">
      <h2>Your vault: ${weapons.length} legendary weapon${weapons.length === 1 ? '' : 's'},
        ${groups.length} unique.</h2>
      <p class="subtle">The reckoning \u2014 keepers up top, shards called out. Two traits drive every verdict.</p>
      <div class="vault">
        ${graded.map(vaultCard).join('') || '<p class="subtle">No legendary weapons found.</p>'}
      </div>
    </section>`;

  document.querySelector('#back').addEventListener('click', () => boot());
}

function vaultCard({ group, rolls, blurb }) {
  const rows = rolls
    .map((r) => {
      const cls = r.keep ? 'keep' : r.verdict.startsWith('Unsure') ? 'unsure' : 'shard';
      return `<li>
        <span class="roll-count">&times;${r.count}</span>
        <span class="roll-traits">${r.traits.map(escapeHtml).join(' + ') || '\u2014'}</span>
        <span class="roll-extras">${r.extras.map(escapeHtml).join(' &middot; ')}</span>
        <span class="roll-verdict ${cls}">${escapeHtml(r.verdict)}</span>
      </li>`;
    })
    .join('');
  return `<div class="vault-card">
    <div class="vault-head">
      <span class="vault-name">${escapeHtml(group.name)}</span>
      <span class="vault-meta">${escapeHtml(group.type || '')} &middot; &times;${group.copies.length}</span>
    </div>
    <p class="vault-blurb">${renderBlurb(blurb)}</p>
    <ul class="roll-list">${rows}</ul>
  </div>`;
}

function renderBlurb(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
