// Reckoner verdict engine — now Doctrine-aware.
// Grades each roll using the shared perk model (power tiers + roles + axes) and
// the player's Doctrine profile: a roll's value in a mode = perk power, boosted
// by how well it fits the player's playstyle and (in PvE) their focus.
import { PERKS_REC } from '../assessment/report.js';
import { combined } from '../assessment/profile.js';

const MODES = ['pve', 'pvp'];
const MODE_LABEL = { pve: 'PvE', pvp: 'PvP' };
const AXIS_KEYS = ['tempo', 'range', 'engine', 'cadence', 'soul'];

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
  const focus = topFocus(profile);
  const dir = { pve: dirOf(profile, 'pve'), pvp: dirOf(profile, 'pvp') };
  const rolls = dedupeRolls(group.copies).map((r) => {
    r.pve = rollModeScore(r.traits, 'pve', dir.pve, focus);
    r.pvp = rollModeScore(r.traits, 'pvp', dir.pvp, null);
    r.recognized = Math.max(r.pve.recognized, r.pvp.recognized);
    return r;
  });

  // Best roll per mode (must clear a meaningful power floor).
  const best = {};
  for (const mode of MODES) {
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

  rolls.sort((a, b) => Number(b.keep) - Number(a.keep) || b.count - a.count);
  return { rolls, blurb: composeBlurb(group, rolls, usageKills, profile, focus) };
}

function dedupeRolls(copies) {
  const map = new Map();
  for (const c of copies) {
    const key = c.traits.join(' + ') || '\u2014';
    if (!map.has(key)) {
      map.set(key, { traits: c.traits, extras: c.extras, count: 0 });
    }
    map.get(key).count += 1;
  }
  return [...map.values()];
}

function composeBlurb(group, rolls, usageKills, profile, focus) {
  const total = group.copies.length;
  const keepers = rolls.filter((r) => r.keep);
  const me = profile ? playerPhrase(profile, focus) : null;

  if (!keepers.length) {
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
  parts.push(`Your roll to beat is **${star.traits.join(' + ')}** — ${perkNote(star.traits)}.`);
  const modeText = keepers.map((k) => k.keepModes.join(' + ')).join(' and ');
  parts.push(me ? `Keep it for ${modeText} — it fits ${me}.` : `That's your ${modeText} keeper.`);

  if (usageKills) {
    parts.push(`You've stacked ${usageKills.toLocaleString()} kills on it, so it's earned the slot.`);
  }
  const dupes = total - keepers.reduce((s, k) => s + k.count, 0);
  if (dupes > 0) {
    parts.push(`The other ${dupes} ${dupes === 1 ? 'copy is' : 'copies are'} vault filler — shard 'em.`);
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
