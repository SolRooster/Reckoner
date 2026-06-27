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

// group: { name, type, copies: [{ traits, extras }] }
// usageKills: number | undefined.  profile: Doctrine profile | null.
export function gradeGun(group, usageKills, profile) {
  const frameInfo = FRAMES[group.frame] || null;
  const focus = topFocus(profile);
  const dir = { pve: dirOf(profile, 'pve'), pvp: dirOf(profile, 'pvp') };
  const rolls = dedupeRolls(group.copies).map((r) => {
    r.pve = rollModeScore(r.traits, 'pve', dir.pve, focus);
    r.pvp = rollModeScore(r.traits, 'pvp', dir.pvp, null);
    r.recognized = Math.max(r.pve.recognized, r.pvp.recognized);
    return r;
  });

  // Best roll per mode — ranked by standalone (Keep) value, not raw power, so
  // build-dependent perks don't steal the Keep. Skip modes the frame can't play.
  const best = {};
  for (const mode of MODES) {
    if (frameInfo && frameInfo[mode] === false) continue;
    let b = null;
    for (const r of rolls) {
      if (r[mode].keepValue < 2) continue;
      if (!b || r[mode].score > b[mode].score || (r[mode].score === b[mode].score && r.count > b.count)) {
        b = r;
      }
    }
    if (b) best[mode] = b;
  }

  for (const r of rolls) {
    const keepFor = [];
    if (best.pve === r) keepFor.push('PvE');
    if (best.pvp === r) keepFor.push('PvP');
    if (keepFor.length) {
      r.keep = true;
      r.keepModes = keepFor;
      r.verdict = `Keep (${keepFor.join(' + ')})`;
    } else if (r.pve.base > 0 || r.pvp.base > 0) {
      r.keep = false;
      r.verdict = 'Shard (outclassed dupe)';
    } else if (r.recognized < r.traits.length) {
      r.keep = false;
      r.verdict = 'Unsure — your call';
    } else {
      r.keep = false;
      r.verdict = 'Shard';
    }
  }

  // Flex: keep the best non-keeper roll per synergy element — a roll worth
  // holding for when you build that subclass. Works for element-agnostic players
  // who rotate builds (keep one Stasis flavor, one Void flavor, etc.).
  const flexByElement = {};
  for (const r of rolls) {
    if (r.keep) continue;
    const syn = rollSynergyElement(r);
    if (!syn) continue;
    const cur = flexByElement[syn.element];
    if (!cur || syn.strength > cur.strength) flexByElement[syn.element] = { roll: r, strength: syn.strength };
  }
  for (const element of Object.keys(flexByElement)) {
    const r = flexByElement[element].roll;
    r.flex = true;
    r.flexElement = element;
    r.verdict = `Flex (${ELEMENT_LABEL[element]})`;
  }

  for (const r of rolls) {
    if (r.keep || r.flex) r.why = rollWhy(r, dir, focus);
  }
  const hwLine = gunHardwareLine(group, rolls, dir);

  const rank = (r) => (r.keep ? 2 : r.flex ? 1 : 0);
  rolls.sort((a, b) => rank(b) - rank(a) || b.count - a.count);
  return {
    rolls,
    frameNote: frameInfo?.note || '',
    blurb: composeBlurb(group, rolls, profile, focus, hwLine),
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

function composeBlurb(group, rolls, profile, focus, hwLine) {
  const total = group.copies.length;
  const keepers = rolls.filter((r) => r.keep);
  const flexes = rolls.filter((r) => r.flex);

  if (!keepers.length && !flexes.length) {
    if (rolls.some((r) => r.verdict.startsWith('Unsure'))) {
      return `Some perks here aren't in my book yet — check the "Unsure" rolls, then shard the rest.`;
    }
    return `Nothing here earns a slot for how you play. Shard all ${total}.`;
  }

  const parts = [];
  if (keepers.length) {
    const star = keepers[0];
    const modeText = keepers.map((k) => k.keepModes.join('+')).join(' & ');
    parts.push(`Best roll: **${star.traits.join(' + ')}** (${modeText}).`);
    if (total > 1) {
      const n = star.count;
      parts.push(
        n >= total
          ? `Every copy can roll it — keep 1, shard the rest.`
          : `${n} of your ${total} copies can roll it — keep ${n === 1 ? 'that one' : 'those'}, shard the rest.`
      );
    }
  }
  if (flexes.length) {
    const f = flexes
      .map((x) => `${x.traits.join(' + ')} for ${ELEMENT_LABEL[x.flexElement]} builds`)
      .join('; ');
    parts.push(`Flex: ${f}.`);
  }
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
