// Reckoner verdict engine — now Doctrine-aware.
// Grades each roll using the shared perk model (power tiers + roles + axes) and
// the player's Doctrine profile: a roll's value in a mode = perk power, boosted
// by how well it fits the player's playstyle and (in PvE) their focus.
import { PERKS_REC } from '../assessment/report.js';
import { combined } from '../assessment/profile.js';

const MODES = ['pve', 'pvp'];
const MODE_LABEL = { pve: 'PvE', pvp: 'PvP' };
const AXIS_KEYS = ['tempo', 'range', 'engine', 'cadence', 'soul'];
const ELEMENT_LABEL = { stasis: 'Stasis', arc: 'Arc', void: 'Void', solar: 'Solar', strand: 'Strand' };

// Weapon frame context. pvp:false / pve:false hard-block that mode (e.g. a
// Support Frame heals allies — it's a PvE tool, never a Crucible verdict).
const FRAMES = {
  'Support Frame': { pvp: false, note: 'Support Frame — heals allies on hipfire. A PvE support tool, not a duelist.' },
  'Wave Frame': { pvp: false, note: 'Wave Frame — a PvE add-clear wave, not a Crucible pick.' },
  'High-Impact Frame': { note: 'High-Impact Frame — slow and hard-hitting; rewards calm, planted aim over run-and-gun.' },
  'Lightweight Frame': { note: 'Lightweight Frame — extra move speed; built for aggressive, mobile play.' },
  'Rapid-Fire Frame': { note: 'Rapid-Fire Frame — fast and forgiving, with deeper mags and faster empty reloads.' },
  'Aggressive Frame': { note: 'Aggressive Frame — heavy hitter that wants you in their face.' },
  'Adaptive Frame': { note: 'Adaptive Frame — the all-rounder; flexible across ranges.' },
  'Precision Frame': { note: 'Precision Frame — tight recoil and reliable, consistent damage.' },
};

function clamp(x, m) {
  return Math.max(-m, Math.min(m, x));
}

function dirOf(profile, mode) {
  if (!profile) return null;
  const c = combined(profile, mode);
  const d = {};
  for (const k of AXIS_KEYS) d[k] = (c[k] ?? 50) - 50;
  return d;
}

function topFocus(profile) {
  const f = profile?.pve?.focus || {};
  let best = null;
  for (const k of ['addclear', 'dps', 'survival']) {
    if (best === null || (f[k] || 0) > (f[best] || 0)) best = k;
  }
  return best && (f[best] || 0) > 0 ? best : null;
}

// A perk is "build-dependent" if it only shines inside a loop/subclass build
// (element-tagged perks, or those explicitly flagged). Standalone perks are
// good on their own — those should win the Keep; build perks fall to Flex.
function isBuild(p) {
  return !!(p.element || p.build);
}

// ---- Holistic hardware (barrel / mag) reading -----------------------------
// Alex never wants to think about barrels or mags. The engine reads them,
// scores them against the Doctrine, and only ever speaks up to confirm a gun's
// hardware already suits his hand. Each hardware perk maps to the stats it
// moves; the Doctrine decides which of those stats matter.
const HARDWARE = {
  Smallbore: { range: 1, stability: 1 },
  'Full Bore': { range: 1.5, stability: -0.5, handling: -0.5 },
  'Hammer-Forged Rifling': { range: 1 },
  'Extended Barrel': { range: 1, stability: 0.5, handling: -0.5 },
  'Fluted Barrel': { handling: 1, stability: 0.5 },
  'Arrowhead Brake': { recoil: 1, handling: 0.5 },
  'Chambered Compensator': { stability: 1, recoil: 0.7, handling: -0.5 },
  'Polygonal Rifling': { stability: 1 },
  'Corkscrew Rifling': { range: 0.5, stability: 0.5, handling: 0.5 },
  'Full Choke': { stability: 0.8 },
  'Rifled Barrel': { range: 1 },
  'Smooth Bore': { handling: 0.4 },
  'Short Barrel': { handling: 1, range: -0.5 },
  'Quick Launch': { handling: 1 },
  'Linear Compensator': { stability: 0.7, range: 0.3 },
  'Volatile Launch': { range: 1, stability: -0.3 },
  'Hard Launch': { range: 0.7, handling: -0.3 },
  'Projection Fuse': { range: 1 },
  'Particle Repeater': { stability: 1 },
  'Liquid Coils': { range: 0.5, recoil: 0.2 },
  'Accelerated Coils': { handling: 0.5 },
  'Flared Magwell': { reload: 1, stability: 0.3 },
  'Alloy Magazine': { reload: 1 },
  'Light Mag': { reload: 0.7, range: 0.5 },
  'Appended Mag': { magsize: 1 },
  'Extended Mag': { magsize: 1.5, reload: -0.5, handling: -0.3 },
  'Tactical Mag': { magsize: 0.7, stability: 0.5, reload: 0.4 },
  'High-Caliber Rounds': { range: 0.5 },
  'Ricochet Rounds': { range: 0.5, stability: 0.7 },
  'Accurized Rounds': { range: 1 },
  'Armor-Piercing Rounds': { range: 0.5 },
  'Steady Rounds': { stability: 1 },
  'Enhanced Battery': { magsize: 1 },
  'Ionized Battery': { magsize: 1, range: 0.3 },
};

function hardwareVec(name) {
  if (HARDWARE[name]) return HARDWARE[name];
  for (const key of Object.keys(HARDWARE)) {
    if (name.startsWith(key)) return HARDWARE[key];
  }
  return null;
}

// Doctrine -> which hardware stats matter, and how much.
function hardwarePrefs(dir) {
  const w = { range: 0, stability: 0.6, handling: 0, reload: 0.5, magsize: 0, recoil: 0.4 };
  if (!dir) return w;
  if (dir.range < 0) { w.range += 0.9; w.stability += 0.3; }          // Sightline
  else if (dir.range > 0) { w.handling += 0.8; w.stability += 0.2; }   // Knife-fighter
  if (dir.tempo > 0) { w.handling += 0.5; w.reload += 0.3; }           // Slayer
  else if (dir.tempo < 0) { w.stability += 0.4; w.range += 0.3; }      // Anchor
  if (dir.cadence > 0) { w.reload += 0.6; }                            // Burst
  else if (dir.cadence < 0) { w.magsize += 0.5; w.stability += 0.2; }  // Sustain
  return w;
}

function hardwareScore(names, prefs) {
  let total = 0;
  let n = 0;
  for (const name of names) {
    const vec = hardwareVec(name);
    if (!vec) continue;
    let s = 0;
    for (const [a, v] of Object.entries(vec)) s += v * (prefs[a] || 0);
    total += s;
    n += 1;
  }
  if (!n) return 0.5; // unknown hardware = neutral; never penalize the unknown
  return Math.max(0, Math.min(1, (total / n + 0.4) / 1.4));
}

const STAT_WORD = { range: 'range', stability: 'stability', handling: 'handling', reload: 'reload', magsize: 'mag size', recoil: 'recoil control' };

function prefPhrase(prefs) {
  return Object.entries(prefs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => STAT_WORD[k])
    .join(' and ');
}

// One quiet, doctrine-aware confirmation — only when the hardware actually fits.
// Stays silent otherwise, so Alex never has to think about barrels or mags.
function gunHardwareLine(group, rolls, dir) {
  const keeper = rolls.find((r) => r.keep);
  if (!keeper) return '';
  const mode = (keeper.keepModes?.[0] || 'PvE').toLowerCase();
  const prefs = hardwarePrefs(dir[mode]);
  let best = 0;
  for (const c of group.copies) {
    best = Math.max(best, hardwareScore((c.hardware || []).flat(), prefs));
  }
  if (best >= 0.62) return `Its ${prefPhrase(prefs)} tuning already suits your hand \u2014 nothing to fuss over.`;
  return '';
}

const FOCUS_WORD = { addclear: 'add-clear', dps: 'boss-DPS', survival: 'survival' };

// Why this roll earns its keep, in how-you-play terms (not just what it does).
function rollWhy(roll, dir, focus) {
  const mode = (roll.keepModes?.[0] || 'PvE').toLowerCase();
  const d = dir[mode] || dir.pve;
  const recd = roll.traits.map((t) => PERKS_REC[t]).filter(Boolean);
  const builds = recd.filter(isBuild);
  const standalone = recd.filter((p) => !isBuild(p));
  const clauses = [];
  if (d && d.engine > 0 && builds.length) clauses.push('feeds the build loop you live in');
  else if (d && d.engine < 0 && standalone.length && !builds.length) clauses.push('pure gunfeel \u2014 no build to babysit');
  if (mode === 'pve' && focus && recd.some((p) => p.role === focus)) {
    clauses.push(`serves your ${FOCUS_WORD[focus]} focus`);
  }
  if (roll.flex && roll.flexElement) clauses.push(`held for ${ELEMENT_LABEL[roll.flexElement]} builds`);
  if (clauses.length) return clauses.join('; ');
  const star = recd.slice().sort((a, b) => (b[mode] || 0) - (a[mode] || 0))[0];
  return star?.note || '';
}

// ---- Personalised perk stack-ranking --------------------------------------
// Ranks every available perk in a column against the player's Doctrine, the
// weapon's element/archetype, and cross-column synergy. Two perks that combo
// (Detonator Beam + Shoot to Loot) both rise; an agnostic damage perk with no
// synergy (PvE Target Lock) sinks.
const SYNERGY = [
  ['Detonator Beam', 'Shoot to Loot', 3, 'the blast drops ammo & orbs you vacuum up'],
  ['Shoot to Loot', 'Chain Reaction', 2, 'shoot a brick, chain the whole room'],
  ['Crystalline Corpsebloom', 'Rimestealer', 2, 'crystals feed your Frost Armor'],
  ['Headstone', 'Rimestealer', 2, 'crystals feed your Frost Armor'],
  ['Chill Clip', 'Rimestealer', 1.5, 'freeze, shatter, armor up'],
  ['Demoralize', 'Destabilizing Rounds', 2, 'volatile + weaken stack hard'],
  ['Rapid Hit', 'Target Lock', 2, 'reload uptime keeps the ramp alive'],
  ['Envious Assassin', 'Bait and Switch', 2, 'overflow, then swap-burst'],
  ['Reconstruction', 'Bait and Switch', 2, 'auto-fills straight into the burst'],
  ['Jolting Feedback', 'Voltshot', 1.5, 'double Arc jolt sources'],
];

function synergyBetween(a, b) {
  for (const [x, y, bonus, note] of SYNERGY) {
    if ((a === x && b === y) || (a === y && b === x)) return { bonus, note };
  }
  return null;
}

const PERK_TIERS = [
  [10, 'S'],
  [7.5, 'A'],
  [5, 'B'],
  [3, 'C'],
  [1, 'D'],
];

function perkTier(score) {
  for (const [th, t] of PERK_TIERS) if (score >= th) return t;
  return '';
}

function perkPersonalScore(name, mode, dir, focus, partners) {
  const p = PERKS_REC[name];
  const reasons = [];
  let s = 0;
  if (p) {
    s += (p[mode] || 0) * 2.5; // base power in this mode
    if (dir) for (const [a, w] of Object.entries(p.axes || {})) s += w * (dir[a] || 0) * 0.1;
    if (dir && dir.engine > 0 && isBuild(p)) {
      s += 2.5;
      reasons.push(p.element ? `${p.element} build synergy` : 'build synergy');
    }
    if (mode === 'pve' && focus && p.role === focus) {
      s += 1.5;
      reasons.push(`${FOCUS_WORD[focus]} focus`);
    }
  }
  let bestSyn = null;
  for (const partner of partners) {
    const syn = synergyBetween(name, partner);
    if (syn && (!bestSyn || syn.bonus > bestSyn.bonus)) bestSyn = { partner, ...syn };
  }
  if (bestSyn) {
    s += bestSyn.bonus;
    reasons.unshift(`with ${bestSyn.partner}: ${bestSyn.note}`);
  }
  if (!reasons.length && p) reasons.push(p.role === 'dps' ? 'raw damage' : p.role);
  return { score: s, reasons, recognized: !!p };
}

function rankColumns(cols, mode, dir, focus) {
  return cols.map((col, i) => {
    const partners = cols.filter((_, j) => j !== i).flat();
    const ranked = col.map((name) => {
      const { score, reasons, recognized } = perkPersonalScore(name, mode, dir, focus, partners);
      return { name, score, tier: recognized ? perkTier(score) : '', why: reasons.join(' \u00b7 ') };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  });
}

function rollModeScore(traits, mode, dir, focus) {
  // Build-oriented (Architect) players value loop/build perks; gunfeel players
  // (Gunslinger) want standalone perks. The Engine axis decides.
  const architect = !!(dir && dir.engine > 0);
  let base = 0;
  let keepValue = 0; // standalone power + build power that fits the player (Architect / focus)
  let fit = 0;
  let focusBoost = 0;
  let recognized = 0;
  for (const t of traits) {
    const p = PERKS_REC[t];
    if (!p) continue;
    recognized += 1;
    const power = p[mode] || 0;
    base += power;
    const buildDependent = isBuild(p);
    const focusMatch = mode === 'pve' && focus && p.role === focus;
    if (!buildDependent || architect || focusMatch) keepValue += power;
    if (focusMatch && power > 0) focusBoost += 1;
    if (dir) for (const [a, w] of Object.entries(p.axes || {})) fit += w * dir[a];
  }
  return { base, keepValue, score: keepValue * 10 + clamp(fit, 8) + focusBoost * 8, recognized };
}

// group: { name, type, frame, copies: [{ instanceId, columns, hardware, roll, locked }] }
// Grades every physical copy as a whole (one verdict per instance) by its best
// achievable roll. Within a gun model the top copy per mode is the Keeper, an
// element-synergy copy is Flex, the rest are Shard.
export function gradeGun(group, usageKills, profile) {
  const frameInfo = FRAMES[group.frame] || null;
  const focus = topFocus(profile);
  const dir = { pve: dirOf(profile, 'pve'), pvp: dirOf(profile, 'pvp') };

  const copies = group.copies.map((c) => {
    const cols = c.columns && c.columns.length ? c.columns : [c.roll || []];
    const combos = cartesian(cols);
    const perMode = {};
    for (const mode of MODES) {
      let b = null;
      for (const traits of combos) {
        const s = rollModeScore(traits, mode, dir[mode], mode === 'pve' ? focus : null);
        if (!b || s.score > b.score) b = { ...s, traits };
      }
      perMode[mode] = b;
    }
    return {
      instanceId: c.instanceId,
      columns: cols,
      hardware: c.hardware,
      locked: !!c.locked,
      roll: c.roll || [],
      pve: perMode.pve,
      pvp: perMode.pvp,
      recognized: Math.max(perMode.pve?.recognized || 0, perMode.pvp?.recognized || 0),
    };
  });

  // Best copy per mode = Keep. Skip modes this frame can't play.
  const best = {};
  for (const mode of MODES) {
    if (frameInfo && frameInfo[mode] === false) continue;
    let b = null;
    for (const c of copies) {
      if ((c[mode]?.keepValue || 0) < 2) continue;
      if (!b || c[mode].score > b[mode].score) b = c;
    }
    if (b) best[mode] = b;
  }

  for (const c of copies) {
    const keepFor = [];
    if (best.pve === c) keepFor.push('PvE');
    if (best.pvp === c) keepFor.push('PvP');
    if (keepFor.length) {
      c.keep = true;
      c.tier = 'keep';
      c.keepModes = keepFor;
      c.verdict = `Keep (${keepFor.join(' + ')})`;
      c.traits = (best.pve === c ? c.pve?.traits : c.pvp?.traits) || c.roll;
    } else {
      const showMode = (c.pve?.score || 0) >= (c.pvp?.score || 0) ? 'pve' : 'pvp';
      c.traits = c[showMode]?.traits || c.roll;
      if (c.recognized < c.traits.length) {
        c.tier = 'unsure';
        c.verdict = 'Unsure \u2014 your call';
      } else {
        c.tier = 'shard';
        c.verdict = 'Shard';
      }
    }
  }

  // Flex: hold the best non-keeper copy per synergy element (one per build flavor).
  const flexByElement = {};
  for (const c of copies) {
    if (c.keep) continue;
    const syn = rollSynergyElement({ traits: c.traits });
    if (!syn) continue;
    const cur = flexByElement[syn.element];
    if (!cur || syn.strength > cur.strength) flexByElement[syn.element] = { copy: c, strength: syn.strength };
  }
  for (const element of Object.keys(flexByElement)) {
    const c = flexByElement[element].copy;
    c.flex = true;
    c.tier = 'flex';
    c.flexElement = element;
    c.verdict = `Flex (${ELEMENT_LABEL[element]})`;
  }

  for (const c of copies) {
    if (c.keep || c.flex) c.why = rollWhy(c, dir, focus);
  }
  for (const c of copies) {
    const m = c.keep
      ? c.keepModes[0].toLowerCase()
      : (c.pve?.score || 0) >= (c.pvp?.score || 0)
      ? 'pve'
      : 'pvp';
    c.rankedColumns = rankColumns(c.columns || [], m, dir[m], m === 'pve' ? focus : null);
  }
  const hwLine = gunHardwareLine(group, copies, dir);

  const rank = (c) => (c.keep ? 3 : c.flex ? 2 : c.tier === 'unsure' ? 1 : 0);
  copies.sort((a, b) => rank(b) - rank(a));

  return {
    copies,
    frameNote: frameInfo?.note || '',
    blurb: composeBlurb(group, copies, profile, focus, hwLine),
  };
}

function rollSynergyElement(r) {
  let best = null;
  for (const t of r.traits) {
    const p = PERKS_REC[t];
    if (!p?.element) continue;
    const strength = Math.max(p.pve || 0, p.pvp || 0);
    if (strength >= 2 && (!best || strength > best.strength)) {
      best = { element: p.element, strength };
    }
  }
  return best;
}

function cartesian(cols) {
  if (!cols || !cols.length) return [[]];
  return cols.reduce((acc, col) => acc.flatMap((combo) => col.map((p) => [...combo, p])), [[]]);
}

// Expands each copy's available column perks into every achievable trait combo,
// then dedupes. count = how many physical copies can field that combo.
function dedupeRolls(copies) {
  const map = new Map();
  for (const c of copies) {
    const cols = c.columns && c.columns.length ? c.columns : [c.traits || []];
    const seen = new Set();
    for (const traits of cartesian(cols)) {
      const key = traits.join(' + ') || '\u2014';
      if (!map.has(key)) map.set(key, { traits, hardware: c.hardware, count: 0 });
      if (!seen.has(key)) {
        map.get(key).count += 1;
        seen.add(key);
      }
    }
  }
  return [...map.values()];
}

function composeBlurb(group, copies, profile, focus, hwLine) {
  const total = group.copies.length;
  const keepers = copies.filter((c) => c.keep);
  const flexes = copies.filter((c) => c.flex);
  const shards = copies.filter((c) => c.tier === 'shard');
  const parts = [];

  if (!keepers.length && !flexes.length) {
    if (copies.some((c) => c.tier === 'unsure')) {
      parts.push(`Some perks here aren't in my book yet \u2014 your call on those.`);
    } else {
      parts.push(`Nothing here fits how you play. Shard all ${total}.`);
    }
    if (hwLine) parts.push(hwLine);
    return parts.join(' ');
  }

  const bits = [];
  if (keepers.length) bits.push(`keep ${keepers.length}`);
  if (flexes.length) bits.push(`flex ${flexes.length}`);
  if (shards.length) bits.push(`shard ${shards.length}`);
  parts.push(`${total} ${total === 1 ? 'copy' : 'copies'}: ${bits.join(', ')}.`);
  if (hwLine) parts.push(hwLine);
  return parts.join(' ');
}

function playerPhrase(profile, focus) {
  const bits = [];
  if (focus === 'survival') bits.push('survival-first');
  else if (focus === 'dps') bits.push('boss-DPS');
  else if (focus === 'addclear') bits.push('add-clear');
  const eng = profile.shared?.engine ?? 50;
  bits.push(eng >= 55 ? 'build-craft' : eng <= 45 ? 'gunfeel' : 'balanced');
  return `your ${bits.join(', ')} game`;
}

function perkNote(traits) {
  const notes = traits.filter((t) => PERKS_REC[t]).map((t) => PERKS_REC[t].note);
  if (!notes.length) return 'a roll worth holding onto';
  if (notes.length === 1) return notes[0];
  return `${notes[0]}, paired with ${notes[1]}`;
}

export { MODE_LABEL };
