// Reckoner verdict engine.
// Grades a gun's rolls: tags each unique roll Keep (mode) / Shard / Unsure,
// keeps only the best roll per mode, and writes a Datto-style summary.
import { PERKS, knows } from './perks.js';

const MODE_LABEL = { pve: 'PvE', pvp: 'PvP' };

function rollModes(traits) {
  const m = new Set();
  for (const t of traits) for (const mode of PERKS[t]?.modes ?? []) m.add(mode);
  return m;
}

function rollScore(traits) {
  return traits.reduce((s, t) => s + (PERKS[t]?.weight ?? 0), 0);
}

function recognizedCount(traits) {
  return traits.filter((t) => knows(t)).length;
}

// group: { name, type, copies: [{ traits, extras }] }
// usageKills: number | undefined (lifetime kills on this gun, if known)
export function gradeGun(group, usageKills) {
  const rolls = dedupeRolls(group.copies);

  // Pick the single best roll for each mode.
  const bestByMode = {};
  for (const mode of ['pve', 'pvp']) {
    let best = null;
    for (const r of rolls) {
      if (!r.modes.includes(mode)) continue;
      if (!best || r.score > best.score || (r.score === best.score && r.count > best.count)) {
        best = r;
      }
    }
    if (best) bestByMode[mode] = best;
  }

  // Assign each roll a verdict.
  for (const r of rolls) {
    const keepFor = [];
    if (bestByMode.pve === r) keepFor.push('PvE');
    if (bestByMode.pvp === r) keepFor.push('PvP');

    if (keepFor.length) {
      r.keep = true;
      r.verdict = `Keep (${keepFor.join(' + ')})`;
    } else if (r.modes.length) {
      r.keep = false;
      r.verdict = 'Shard (outclassed dupe)';
    } else if (recognizedCount(r.traits) < r.traits.length) {
      r.keep = false;
      r.verdict = 'Unsure — your call';
    } else {
      r.keep = false;
      r.verdict = 'Shard';
    }
  }

  rolls.sort((a, b) => Number(b.keep) - Number(a.keep) || b.count - a.count);
  return { rolls, blurb: composeBlurb(group, rolls, bestByMode, usageKills) };
}

function dedupeRolls(copies) {
  const map = new Map();
  for (const c of copies) {
    const key = c.traits.join(' + ') || '\u2014';
    if (!map.has(key)) {
      map.set(key, {
        traits: c.traits,
        extras: c.extras,
        count: 0,
        modes: [...rollModes(c.traits)],
        score: rollScore(c.traits),
      });
    }
    map.get(key).count += 1;
  }
  return [...map.values()];
}

function composeBlurb(group, rolls, bestByMode, usageKills) {
  const total = group.copies.length;
  const keepers = rolls.filter((r) => r.keep);

  if (!keepers.length) {
    const anyUnsure = rolls.some((r) => r.verdict.startsWith('Unsure'));
    if (anyUnsure) {
      return `Honestly? Nothing here screams keeper, but a couple of these perks aren't in my notes yet — eyeball the "Unsure" rolls before you pull the trigger. Everything else is glimmer.`;
    }
    return `Real talk — none of these rolls do enough in PvE or PvP for how you play. Shard the whole stack of ${total} and take the glimmer. You won't miss it.`;
  }

  const parts = [];
  const star = keepers[0];
  const traitText = star.traits.join(' + ');
  const note = perkNote(star.traits);
  parts.push(`Your roll to beat is **${traitText}** — ${note}.`);

  const modeText = keepers
    .map((k) => k.verdict.replace('Keep (', '').replace(')', ''))
    .join(' and ');
  parts.push(`That's your ${modeText} keeper.`);

  if (usageKills) {
    parts.push(`You've already stacked ${usageKills.toLocaleString()} kills on it, so it's earned the slot.`);
  }

  const dupes = total - keepers.reduce((s, k) => s + k.count, 0);
  if (dupes > 0) {
    parts.push(`The other ${dupes} ${dupes === 1 ? 'copy is' : 'copies are'} vault filler — shard 'em and reclaim the space.`);
  }

  return parts.join(' ');
}

function perkNote(traits) {
  const notes = traits.filter((t) => PERKS[t]).map((t) => PERKS[t].note);
  if (!notes.length) return 'a roll worth holding onto';
  if (notes.length === 1) return notes[0];
  return `${notes[0]}, paired with a perk that ${notes[1]}`;
}

export { MODE_LABEL };
