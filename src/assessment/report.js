// Reckoner Doctrine report — turns a mode profile into a CliftonStrengths-style
// readout: a summary, the weapon frames that fit, and perks to chase / avoid.
import { AXES } from './questions.js';
import { combined } from './profile.js';

// Perk -> { axes, modes }. Axis sign follows pole A (+) vs pole B (-):
// tempo +Slayer/-Anchor, range +Knife-fighter/-Sightline, engine +Architect/-Gunslinger,
// cadence +Burst/-Sustain, soul +Showtime/-Bedrock. `modes` gates which mode it's
// even eligible to be recommended in (no Bait and Switch in PvP).
const PERKS_REC = {
  // Aggression / momentum
  Rampage: { axes: { tempo: 2, cadence: 1 }, modes: ['pve', 'pvp'] },
  'Kill Clip': { axes: { tempo: 1, cadence: 1 }, modes: ['pve', 'pvp'] },
  Swashbuckler: { axes: { tempo: 2, range: 1 }, modes: ['pve', 'pvp'] },
  'Killing Wind': { axes: { tempo: 1, range: -1 }, modes: ['pve', 'pvp'] },
  Slideways: { axes: { tempo: 1, soul: -1 }, modes: ['pve', 'pvp'] },
  Kickstart: { axes: { tempo: 2 }, modes: ['pve', 'pvp'] },
  'Moving Target': { axes: { tempo: 1, range: 1 }, modes: ['pvp'] },
  'Tap the Trigger': { axes: { tempo: 1, range: 1 }, modes: ['pvp'] },
  'Grave Robber': { axes: { range: 2, tempo: 1 }, modes: ['pve'] },
  'Threat Detector': { axes: { range: 2 }, modes: ['pve', 'pvp'] },

  // Anchor / control — the slow-down perks
  'Firmly Planted': { axes: { tempo: -2 }, modes: ['pve', 'pvp'] },
  'Slide Shot': { axes: { tempo: 1, range: -1 }, modes: ['pve', 'pvp'] },

  // Range / precision / gunfeel (Gunslinger-friendly)
  'Opening Shot': { axes: { range: -2, soul: -1, engine: -1 }, modes: ['pvp'] },
  Rangefinder: { axes: { range: -2, engine: -1 }, modes: ['pve', 'pvp'] },
  'Zen Moment': { axes: { range: -1, soul: -1, engine: -1 }, modes: ['pve', 'pvp'] },
  'Rapid Hit': { axes: { range: -1, soul: -1, engine: -1 }, modes: ['pve', 'pvp'] },
  'Dynamic Sway Reduction': { axes: { soul: -1, engine: -1 }, modes: ['pve', 'pvp'] },
  'Explosive Payload': { axes: { range: -1, soul: -1 }, modes: ['pve', 'pvp'] },
  'Eye of the Storm': { axes: { soul: 1, tempo: 1 }, modes: ['pvp'] },
  'Snapshot Sights': { axes: { range: -1, soul: 1, engine: -1 }, modes: ['pve', 'pvp'] },
  'Perpetual Motion': { axes: { tempo: 1, soul: -1, engine: -1 }, modes: ['pve', 'pvp'] },

  // Burst / DPS (PvE)
  'Vorpal Weapon': { axes: { cadence: 2 }, modes: ['pve'] },
  'Bait and Switch': { axes: { cadence: 2, engine: 1 }, modes: ['pve'] },
  'High-Impact Reserves': { axes: { cadence: 1 }, modes: ['pve', 'pvp'] },

  // Sustain / uptime (PvE-leaning)
  Reconstruction: { axes: { cadence: -2 }, modes: ['pve'] },
  Subsistence: { axes: { cadence: -1 }, modes: ['pve', 'pvp'] },
  Overflow: { axes: { cadence: -1 }, modes: ['pve'] },
  'Rewind Rounds': { axes: { cadence: -1 }, modes: ['pve'] },
  'Target Lock': { axes: { cadence: -1, range: 1 }, modes: ['pve', 'pvp'] },

  // Ability-loop / synergy (Architect) — the "space magic" perks
  Demolitionist: { axes: { engine: 2 }, modes: ['pve', 'pvp'] },
  Pugilist: { axes: { engine: 2, range: 1 }, modes: ['pve'] },
  Voltshot: { axes: { engine: 2, cadence: -1 }, modes: ['pve'] },
  'Repulsor Brace': { axes: { engine: 2 }, modes: ['pve'] },
  'Destabilizing Rounds': { axes: { engine: 2, cadence: -1 }, modes: ['pve'] },
  'Aggregate Charge': { axes: { engine: 2, cadence: 1 }, modes: ['pve'] },
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
  const scored = Object.entries(PERKS_REC)
    .filter(([, def]) => def.modes.includes(mode))
    .map(([name, def]) => {
      let fit = 0;
      let topAxis = null;
      let topMag = 0;
      for (const [a, w] of Object.entries(def.axes)) {
        const contrib = w * dir[a];
        fit += contrib;
        if (Math.abs(contrib) > topMag) {
          topMag = Math.abs(contrib);
          topAxis = a;
        }
      }
      return { name, fit, topAxis };
    });

  if (kind === 'seek') {
    return scored
      .filter((p) => p.fit > 10)
      .sort((a, b) => b.fit - a.fit)
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
  const pole = (c[p.topAxis] ?? 50) >= 50 ? 'a' : 'b';
  return `plays into how ${PHRASE[p.topAxis][pole]}`;
}

function whyAvoid(p, c) {
  const pole = (c[p.topAxis] ?? 50) >= 50 ? 'a' : 'b';
  return `asks for the opposite of how ${PHRASE[p.topAxis][pole]}`;
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
