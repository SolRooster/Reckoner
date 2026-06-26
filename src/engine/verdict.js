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

function rollModeScore(traits, mode, dir, focus) {
  let base = 0;
  let fit = 0;
  let focusBoost = 0;
  let recognized = 0;
  for (const t of traits) {
    const p = PERKS_REC[t];
    if (!p) continue;
    recognized += 1;
    const power = p[mode] || 0;
    base += power;
    if (dir) for (const [a, w] of Object.entries(p.axes || {})) fit += w * dir[a];
    if (mode === 'pve' && focus && p.role === focus && power > 0) focusBoost += 1;
  }
  return { base, score: base * 10 + clamp(fit, 12) + focusBoost * 8, recognized };
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

  // Best roll per mode (must clear a meaningful power floor; skip modes the
  // frame can't play, e.g. a Support Frame in PvP).
  const best = {};
  for (const mode of MODES) {
    if (frameInfo && frameInfo[mode] === false) continue;
    let b = null;
    for (const r of rolls) {
      if (r[mode].base < 1) continue;
      if (!b || r[mode].score > b[mode].score || (r[mode].score === b[mode].score && r.count > b.count)) {
        b = r;
      }
    }
    if (b && b[mode].base >= 2) best[mode] = b;
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

  const rank = (r) => (r.keep ? 2 : r.flex ? 1 : 0);
  rolls.sort((a, b) => rank(b) - rank(a) || b.count - a.count);
  return { rolls, blurb: composeBlurb(group, rolls, usageKills, profile, focus), frameNote: frameInfo?.note || '' };
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
      if (!map.has(key)) map.set(key, { traits, extras: c.extras, count: 0 });
      if (!seen.has(key)) {
        map.get(key).count += 1;
        seen.add(key);
      }
    }
  }
  return [...map.values()];
}

function composeBlurb(group, rolls, usageKills, profile, focus) {
  const total = group.copies.length;
  const keepers = rolls.filter((r) => r.keep);
  const flexes = rolls.filter((r) => r.flex);
  const me = profile ? playerPhrase(profile, focus) : null;

  const flexLine = flexes.length
    ? `Hang onto ${flexes.length === 1 ? 'one' : flexes.length} as a Flex — ${flexes
        .map((f) => `the ${f.traits.join(' + ')} roll pops on ${ELEMENT_LABEL[f.flexElement]} builds`)
        .join('; ')}.`
    : '';

  if (!keepers.length) {
    if (flexes.length) {
      return `No universal keeper here, but it's not all glimmer. ${flexLine} Shard the rest.`;
    }
    const anyUnsure = rolls.some((r) => r.verdict.startsWith('Unsure'));
    if (anyUnsure) {
      return `A couple of these perks aren't in my book yet — eyeball the "Unsure" rolls before you shard. The rest don't earn their slot.`;
    }
    return me
      ? `Nothing here fits ${me} — no real damage, survival, or duel value for how you play. Shard all ${total}.`
      : `None of these rolls do enough. Shard the stack of ${total} and take the glimmer.`;
  }

  const parts = [];
  const star = keepers[0];
  parts.push(`Your best roll is **${star.traits.join(' + ')}** — ${perkNote(star.traits)}.`);
  const modeText = keepers.map((k) => k.keepModes.join(' + ')).join(' and ');
  parts.push(me ? `Keep it for ${modeText} — it fits ${me}.` : `That's your ${modeText} keeper.`);
  if (flexLine) parts.push(flexLine);
  if (usageKills) {
    parts.push(`You've stacked ${usageKills.toLocaleString()} kills on it, so it's earned the slot.`);
  }
  if (total > 1) {
    parts.push(`You've got ${total} copies — keep one on the roll above and shard the rest.`);
  }
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
