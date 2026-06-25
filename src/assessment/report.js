// Reckoner Doctrine report — turns a mode profile into a CliftonStrengths-style
// readout: a summary, the weapon frames that fit, and perks to chase / avoid.
import { AXES } from './questions.js';
import { combined } from './profile.js';

// Perk -> { axes, pve, pvp, note }. Axis sign follows pole A (+) vs pole B (-):
// tempo +Slayer/-Anchor, range +Knife-fighter/-Sightline, engine +Architect/-Gunslinger,
// cadence +Burst/-Sustain, soul +Showtime/-Bedrock.
// pve/pvp = power tier in that mode (0 = not eligible, 1 = niche, 2 = strong, 3 = top).
// "Chase" ranks by power first, playstyle fit second; 0 means it never shows for that mode.
const PERKS_REC = {
  // --- PvE damage / burst ---
  'Bait and Switch': { axes: { cadence: 2, engine: 1 }, pve: 3, pvp: 0, note: 'huge burst DPS if you swap across all three weapons' },
  'Firing Line': { axes: { cadence: 2 }, pve: 3, pvp: 0, note: 'big crit damage when you fight near teammates' },
  'Aggregate Charge': { axes: { engine: 2, cadence: 1 }, pve: 3, pvp: 0, note: 'scales with unique debuffs — elite for Void/Prismatic loops, dead weight without them' },
  'Vorpal Weapon': { axes: { cadence: 2 }, pve: 2, pvp: 1, note: 'flat bonus damage to bosses, majors and supers' },
  'Controlled Burst': { axes: { soul: -1 }, pve: 3, pvp: 2, note: 'fusion perk — perfect bolts ramp damage; strong both ways' },
  'Reservoir Burst': { axes: { cadence: 2 }, pve: 2, pvp: 1, note: 'a full mag hits harder and explodes' },
  'High-Impact Reserves': { axes: { cadence: 1 }, pve: 2, pvp: 1, note: 'more damage as the mag runs low — special-weapon staple' },
  'Killing Tally': { axes: { cadence: 1 }, pve: 2, pvp: 0, note: 'stacking damage that loves long fights' },
  Frenzy: { axes: { cadence: -1 }, pve: 2, pvp: 1, note: 'free damage, reload and handling once a fight gets going' },
  'Target Lock': { axes: { cadence: -1, range: 1 }, pve: 2, pvp: 1, note: 'ramps damage the longer you stay on target — loves SMGs/autos' },

  // --- PvE add-clear ---
  'Chain Reaction': { axes: {}, pve: 3, pvp: 0, note: 'every kill triggers an elemental blast — pure add-clear' },
  Incandescent: { axes: {}, pve: 3, pvp: 1, note: 'kills scatter scorch — a Solar add-clear staple' },
  Voltshot: { axes: { engine: 2 }, pve: 3, pvp: 1, note: 'reload-on-kill to jolt the next target' },
  'Destabilizing Rounds': { axes: { engine: 2 }, pve: 2, pvp: 1, note: 'kills make targets volatile for chain explosions' },
  Dragonfly: { axes: {}, pve: 2, pvp: 1, note: 'precision kills pop an elemental burst' },
  'Kinetic Tremors': { axes: { cadence: -1 }, pve: 2, pvp: 1, note: 'sustained hits send a damaging shockwave through targets' },
  'Golden Tricorn': { axes: {}, pve: 2, pvp: 1, note: 'big stack when you mix ability and weapon kills' },

  // --- PvE economy / uptime ---
  Reconstruction: { axes: { cadence: -2 }, pve: 3, pvp: 1, note: 'auto-refills an oversized mag — never reload' },
  'Envious Assassin': { axes: { cadence: -1 }, pve: 3, pvp: 0, note: 'overflows the mag off kills before you swap to a boss' },
  Demolitionist: { axes: { engine: 2 }, pve: 2, pvp: 1, note: 'kills feed your grenade — ability-loop fuel' },
  Overflow: { axes: { cadence: -1 }, pve: 2, pvp: 1, note: 'double mag off a brick — burst before reloading (needs ammo pickups)' },
  'Rewind Rounds': { axes: { cadence: -1 }, pve: 2, pvp: 0, note: 'refunds the mag based on hits — endless uptime' },
  'Repulsor Brace': { axes: { engine: 2 }, pve: 2, pvp: 1, note: 'Void kills grant an overshield — survivability glue' },
  Subsistence: { axes: { cadence: -1 }, pve: 1, pvp: 1, note: 'kills top up the mag from reserves' },

  // --- PvP dueling ---
  'Kill Clip': { axes: { tempo: 1, cadence: 1 }, pve: 1, pvp: 3, note: 'reload after a kill for a damage spike — a Crucible one-tap enabler' },
  Desperado: { axes: { tempo: 1 }, pve: 1, pvp: 3, note: 'precision kills crank pulse-rifle fire rate' },
  Headseeker: { axes: { range: -1 }, pve: 0, pvp: 3, note: 'body shots boost your follow-up headshot — pulse cornerstone' },
  'Eye of the Storm': { axes: { soul: 1, tempo: 1 }, pve: 0, pvp: 3, note: 'gets better the lower your health — clutch perk' },
  Rampage: { axes: { tempo: 2, cadence: 1 }, pve: 1, pvp: 2, note: 'stacks damage as you chain kills — keeps you on offense' },
  Swashbuckler: { axes: { tempo: 2, range: 1 }, pve: 2, pvp: 2, note: 'melee or weapon kills spike damage — a close-range monster' },
  'Opening Shot': { axes: { range: -2, soul: -1, engine: -1 }, pve: 0, pvp: 2, note: 'first shot of a fight gets bonus range and accuracy' },
  Rangefinder: { axes: { range: -2, engine: -1 }, pve: 0, pvp: 2, note: 'extends effective range while aiming' },
  'Moving Target': { axes: { tempo: 1, range: 1 }, pve: 0, pvp: 2, note: 'better strafe speed and aim assist while moving' },
  'Killing Wind': { axes: { tempo: 1, range: -1 }, pve: 1, pvp: 2, note: 'a kill grants range, handling and speed' },
  Slideways: { axes: { tempo: 1, soul: -1 }, pve: 1, pvp: 2, note: 'slide to reload and gain stability — for the aggressive push' },
  Kickstart: { axes: { tempo: 2 }, pve: 1, pvp: 2, note: 'slide into a faster, harder-hitting charged shot' },
  'Tap the Trigger': { axes: { tempo: 1, range: 1 }, pve: 0, pvp: 2, note: 'tightens the first burst — for fusions and shotguns' },
  'Explosive Payload': { axes: { range: -1, soul: -1 }, pve: 1, pvp: 2, note: 'rounds deal bonus area damage — consistent chip at range' },
  'Snapshot Sights': { axes: { range: -1, soul: 1, engine: -1 }, pve: 1, pvp: 2, note: 'lightning-fast ADS — duels and quickscopes' },

  // --- Gunfeel / control (Gunslinger-friendly) ---
  'Zen Moment': { axes: { range: -1, soul: -1, engine: -1 }, pve: 1, pvp: 2, note: 'damage dealt tightens recoil — pure control' },
  'Rapid Hit': { axes: { range: -1, soul: -1, engine: -1 }, pve: 1, pvp: 2, note: 'precision hits boost reload and stability' },
  'Dynamic Sway Reduction': { axes: { soul: -1, engine: -1 }, pve: 1, pvp: 2, note: 'sustained fire tightens accuracy — a feel perk' },
  'Perpetual Motion': { axes: { tempo: 1, soul: -1, engine: -1 }, pve: 1, pvp: 2, note: 'stat boost while you keep moving' },

  // --- Anchor / point-blank (mismatches for aggressive, mobile players) ---
  'Firmly Planted': { axes: { tempo: -2 }, pve: 1, pvp: 1, note: 'big accuracy and handling boost — but only while standing still' },
  'Threat Detector': { axes: { range: 2 }, pve: 1, pvp: 1, note: 'buffs reload and stability when enemies are close — rewards point-blank' },
};

// How to describe the player's own tendency on each axis pole.
const PHRASE = {
  tempo: { a: 'you push and pressure', b: 'you hold and control' },
  range: { a: 'you fight up close', b: 'you fight from range' },
  engine: { a: 'you build around synergy', b: 'you lean on raw gunplay' },
  cadence: { a: 'you want big bursts', b: 'you want uptime' },
  soul: { a: 'you play for flash', b: 'you play for consistency' },
};

export function buildReport(profile, mode) {
  const c = combined(profile, mode);
  return {
    summary: summaryText(c, mode),
    frames: frameFit(c),
    seek: rankPerks(c, 'seek', mode),
    avoid: rankPerks(c, 'avoid', mode),
  };
}

function dirOf(c) {
  const d = {};
  for (const k of Object.keys(AXES)) d[k] = (c[k] ?? 50) - 50;
  return d;
}

function rankPerks(c, kind, mode) {
  const dir = dirOf(c);
  const clamp = (x, m) => Math.max(-m, Math.min(m, x));
  const scored = Object.entries(PERKS_REC)
    .filter(([, d]) => (d[mode] || 0) > 0)
    .map(([name, d]) => {
      let fit = 0;
      let topAxis = null;
      let topMag = 0;
      for (const [a, w] of Object.entries(d.axes)) {
        const contrib = w * dir[a];
        fit += contrib;
        if (Math.abs(contrib) > topMag) {
          topMag = Math.abs(contrib);
          topAxis = a;
        }
      }
      return { name, fit, topAxis, note: d.note, power: d[mode] };
    });

  if (kind === 'seek') {
    // Power dominates; playstyle fit breaks ties within a tier.
    return scored
      .filter((p) => p.power >= 2)
      .map((p) => ({ ...p, chase: p.power * 15 + clamp(p.fit, 12) }))
      .sort((a, b) => b.chase - a.chase)
      .slice(0, 4)
      .map((p) => ({ name: p.name, why: whySeek(p, c) }));
  }
  return scored
    .filter((p) => p.fit < -10)
    .sort((a, b) => a.fit - b.fit)
    .slice(0, 3)
    .map((p) => ({ name: p.name, why: whyAvoid(p, c) }));
}

function whySeek(p, c) {
  if (p.fit > 6 && p.topAxis) {
    const pole = (c[p.topAxis] ?? 50) >= 50 ? 'a' : 'b';
    return `${p.note} — fits how ${PHRASE[p.topAxis][pole]}`;
  }
  return p.note;
}

function whyAvoid(p, c) {
  if (!p.topAxis) return `${p.note} — not built for your game`;
  const pole = (c[p.topAxis] ?? 50) >= 50 ? 'a' : 'b';
  return `${p.note} — works against how ${PHRASE[p.topAxis][pole]}`;
}

function frameFit(c) {
  const frames = [];
  if (c.range <= 42) {
    frames.push('Fast-frame scouts and high-range pulses — own the lane');
    frames.push('Precision / lightweight sidearms to cover close-to-mid');
  } else if (c.range >= 58) {
    frames.push('Fusions, shotguns and SMGs — win the close fight');
  } else {
    frames.push('Hand cannons and adaptive pulses for the mid-range duel');
  }

  if (c.cadence <= 42) {
    frames.push('Rapid-fire / adaptive frames for relentless uptime');
  } else if (c.cadence >= 58) {
    frames.push('High-impact and precision frames; linears or rockets for boss DPS');
  }

  if (c.engine >= 58) {
    frames.push('Lean on ability-feeding perks (Demolitionist, Voltshot, synergy) — they matter more than raw stats for you');
  } else if (c.engine <= 42) {
    frames.push('Tune for gunfeel — reload, handling, stability; perks that sharpen the gun, not the build');
  }
  return frames;
}

function summaryText(c, mode) {
  const label = mode === 'pvp' ? 'the Crucible' : 'PvE';
  const tempo = PHRASE.tempo[c.tempo >= 50 ? 'a' : 'b'];
  const range = PHRASE.range[c.range >= 50 ? 'a' : 'b'];
  const soul = PHRASE.soul[c.soul >= 50 ? 'a' : 'b'];

  let tension = '';
  if (c.tempo >= 58 && c.range <= 42) {
    tension = ` There\u2019s a real edge to your game: aggressive intent, but you win from range — so you want perks that let you press without giving up your spacing.`;
  } else if (c.tempo <= 42 && c.range >= 58) {
    tension = ` You play patient but fight close, so you lean on perks that reward holding your ground in a brawl.`;
  }

  let engineLine = '';
  if (c.engine <= 38) {
    engineLine = ` You\u2019re a gunfeel purist — you\u2019d rather a weapon feel perfect than feed a build, so chase reload/handling/stability perks and skip the ability-loop \u201cspace magic.\u201d`;
  } else if (c.engine >= 62) {
    engineLine = ` You\u2019re a build architect — perks that feed your abilities and synergies are worth more to you than raw stats.`;
  }

  return `In ${label}, ${tempo}, ${range}, and ${soul}.${tension}${engineLine}`;
}
