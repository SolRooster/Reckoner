// Reckoner Doctrine report — turns a mode profile into a CliftonStrengths-style
// readout: a summary, the weapon frames that fit, and perks to chase / avoid.
import { AXES } from './questions.js';
import { combined } from './profile.js';

// Perk -> axis affinities. Sign follows pole A (+) vs pole B (-) per axis:
// tempo +Slayer/-Anchor, range +Knife-fighter/-Sightline, engine +Architect/-Gunslinger,
// cadence +Burst/-Sustain, soul +Showtime/-Bedrock.
const PERK_AXES = {
  Rampage: { tempo: 2, cadence: 1 },
  'Kill Clip': { tempo: 1, cadence: 1 },
  Swashbuckler: { tempo: 2, range: 1 },
  Frenzy: { tempo: 1, cadence: -1 },
  'Killing Wind': { tempo: 1, range: -1 },
  Onslaught: { tempo: 1, cadence: -1 },
  'Moving Target': { tempo: 1, range: 1 },
  'Tap the Trigger': { tempo: 1, range: 1 },
  'Firmly Planted': { tempo: -2 },
  'Opening Shot': { range: -2, soul: -1 },
  Rangefinder: { range: -2 },
  'Zen Moment': { range: -1, soul: -1 },
  'Rapid Hit': { range: -1, soul: -1 },
  'Explosive Payload': { range: -1, soul: -1 },
  'Eye of the Storm': { soul: 1, tempo: 1 },
  'Snapshot Sights': { range: -1, soul: 1 },
  'Threat Detector': { range: 2 },
  'Grave Robber': { range: 2, tempo: 1 },
  'Vorpal Weapon': { cadence: 2 },
  'Bait and Switch': { cadence: 2, engine: 1 },
  'High-Impact Reserves': { cadence: 1 },
  Reconstruction: { cadence: -2 },
  Subsistence: { cadence: -1 },
  Overflow: { cadence: -1 },
  'Rewind Rounds': { cadence: -1 },
  'Target Lock': { cadence: -1, range: 1 },
  Demolitionist: { engine: 2 },
  Pugilist: { engine: 2, range: 1 },
  Voltshot: { engine: 2, cadence: -1 },
  'Repulsor Brace': { engine: 2 },
  'Destabilizing Rounds': { engine: 1, cadence: -1 },
  'Perpetual Motion': { tempo: 1, soul: -1 },
  Slideshot: { tempo: 1, range: -1 },
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
    seek: rankPerks(c, 'seek'),
    avoid: rankPerks(c, 'avoid'),
  };
}

function dirOf(c) {
  const d = {};
  for (const k of Object.keys(AXES)) d[k] = (c[k] ?? 50) - 50;
  return d;
}

function rankPerks(c, kind) {
  const dir = dirOf(c);
  const scored = Object.entries(PERK_AXES).map(([name, ax]) => {
    let fit = 0;
    let topAxis = null;
    let topMag = 0;
    for (const [a, w] of Object.entries(ax)) {
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
      .filter((p) => p.fit > 12)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 4)
      .map((p) => ({ name: p.name, why: whySeek(p, c) }));
  }
  return scored
    .filter((p) => p.fit < -12)
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
    frames.push('Lean on ability-feeding perks — they matter more than raw stats for you');
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

  return `In ${label}, ${tempo}, ${range}, and ${soul}.${tension}`;
}
