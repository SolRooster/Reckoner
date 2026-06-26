// Reckoner Doctrine report — turns a mode profile into a CliftonStrengths-style
// readout: a summary, the weapon frames that fit, and perks to chase / avoid.
import { AXES } from './questions.js';
import { combined } from './profile.js';

// Perk -> { axes, pve, pvp, note, role }. Axis sign follows pole A (+) vs pole B (-):
// tempo +Slayer/-Anchor, range +Knife-fighter/-Sightline, engine +Architect/-Gunslinger,
// cadence +Burst/-Sustain, soul +Showtime/-Bedrock.
// pve/pvp = power tier in that mode (0 = not eligible, 1 = niche, 2 = strong, 3 = top).
// role = PvE job: 'addclear' | 'dps' | 'survival' | 'economy' | 'utility'. The player's
// PvE focus boosts perks whose role matches. Economy/utility never count as PvE "avoid".
export const PERKS_REC = {
  // --- PvE damage / burst (role: dps) ---
  'Bait and Switch': { axes: { cadence: 2, engine: 1 }, pve: 3, pvp: 0, role: 'dps', note: 'huge burst DPS if you swap across all three weapons' },
  'Firing Line': { axes: { cadence: 2 }, pve: 3, pvp: 0, role: 'dps', note: 'big crit damage when you fight near teammates' },
  'Aggregate Charge': { axes: { engine: 2, cadence: 1 }, pve: 3, pvp: 0, role: 'dps', note: 'scales with unique debuffs — elite for Void/Prismatic loops, dead weight without them' },
  'Controlled Burst': { axes: { soul: -1 }, pve: 3, pvp: 2, role: 'dps', note: 'fusion perk — perfect bolts ramp damage; strong both ways' },
  'Vorpal Weapon': { axes: {}, pve: 2, pvp: 1, role: 'dps', note: 'flat bonus damage to bosses, majors and supers' },
  'Reservoir Burst': { axes: { cadence: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'a full mag hits harder and explodes' },
  'High-Impact Reserves': { axes: {}, pve: 2, pvp: 1, role: 'dps', note: 'more damage as the mag runs low — special-weapon staple' },
  'Killing Tally': { axes: { cadence: 1 }, pve: 2, pvp: 0, role: 'dps', note: 'stacking damage that loves long fights' },
  Frenzy: { axes: {}, pve: 2, pvp: 1, role: 'dps', note: 'free damage, reload and handling once a fight gets going' },
  'Target Lock': { axes: { range: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'ramps damage the longer you stay on target — loves SMGs/autos' },
  'Elemental Honing': { axes: {}, pve: 3, pvp: 1, role: 'dps', note: 'stacking damage from unique elemental hits (15→ 50%) — a current top-tier damage perk' },
  'Disruption Break': { axes: {}, pve: 2, pvp: 1, role: 'utility', note: 'breaking a shield makes targets take +50% Kinetic damage — strong setup perk' },
  'Multikill Clip': { axes: { cadence: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'reload-after-kills stacks up to +50% damage' },
  'One for All': { axes: {}, pve: 2, pvp: 0, role: 'dps', note: '+35% damage after tagging three separate targets' },
  'Focused Fury': { axes: {}, pve: 2, pvp: 1, role: 'dps', note: '+20% damage after half a mag of precision hits' },
  'Adrenaline Junkie': { axes: { engine: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'grenade and weapon kills ramp damage — ability-loop friendly' },
  Onslaught: { axes: { cadence: -1 }, pve: 2, pvp: 1, role: 'dps', note: 'kills crank fire rate — a sustained-fire monster' },
  Surrounded: { axes: { range: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'big damage when enemies are near — close-quarters add-clear' },
  'Master of Arms': { axes: {}, pve: 2, pvp: 2, role: 'dps', note: 'any kind of kill boosts damage — endlessly flexible' },
  'Chaos Reshaped': { axes: { engine: 1 }, pve: 2, pvp: 0, role: 'economy', note: 'cast your Super to fully reload both weapons — DPS uptime' },

  // --- PvE add-clear (role: addclear) ---
  'Chain Reaction': { axes: {}, pve: 3, pvp: 0, role: 'addclear', note: 'every kill triggers an elemental blast — pure add-clear' },
  Incandescent: { axes: {}, pve: 3, pvp: 1, role: 'addclear', element: 'solar', note: 'kills scatter scorch — a Solar add-clear staple' },
  Voltshot: { axes: { engine: 2 }, pve: 3, pvp: 1, role: 'addclear', element: 'arc', note: 'reload-on-kill to jolt the next target' },
  'Destabilizing Rounds': { axes: { engine: 2 }, pve: 2, pvp: 1, role: 'addclear', element: 'void', note: 'kills make targets volatile for chain explosions' },
  Dragonfly: { axes: {}, pve: 2, pvp: 1, role: 'addclear', note: 'precision kills pop an elemental burst' },
  'Kinetic Tremors': { axes: {}, pve: 2, pvp: 1, role: 'addclear', note: 'sustained hits send a damaging shockwave through targets' },
  'Golden Tricorn': { axes: {}, pve: 2, pvp: 1, role: 'addclear', note: 'big stack when you mix ability and weapon kills' },
  Hatchling: { axes: { engine: 1 }, pve: 2, pvp: 1, role: 'addclear', element: 'strand', note: 'precision or final blows spawn Threadlings that chase enemies' },

  // --- PvE survivability (role: survival) ---
  'Heal Clip': { axes: { engine: 1 }, pve: 3, pvp: 1, role: 'survival', note: 'reload after a kill to heal yourself and cure allies — survivability glue' },
  'Repulsor Brace': { axes: { engine: 2 }, pve: 2, pvp: 1, role: 'survival', element: 'void', note: 'Void kills grant an overshield — keeps you alive in the thick of it' },

  // --- PvE economy / uptime (role: economy — never a PvE "avoid") ---
  Reconstruction: { axes: { engine: 1 }, pve: 3, pvp: 1, role: 'economy', note: 'auto-refills an oversized mag — sets up a full DPS dump without reloading' },
  'Envious Assassin': { axes: {}, pve: 3, pvp: 0, role: 'economy', note: 'overflows the mag off kills before you swap to a boss' },
  Demolitionist: { axes: { engine: 2 }, pve: 2, pvp: 1, role: 'economy', note: 'kills feed your grenade — ability-loop fuel' },
  Pugilist: { axes: { engine: 2, range: 1 }, pve: 2, pvp: 1, role: 'economy', note: 'kills charge your melee — fuel for punch-build loops' },
  Overflow: { axes: {}, pve: 2, pvp: 1, role: 'economy', note: 'double mag off a brick — burst before reloading (needs ammo pickups)' },
  'Rewind Rounds': { axes: {}, pve: 2, pvp: 0, role: 'economy', note: 'refunds the mag based on hits — endless uptime' },
  Subsistence: { axes: {}, pve: 1, pvp: 1, role: 'economy', note: 'kills top up the mag from reserves' },
  'Firmly Planted': { axes: { tempo: -2 }, pve: 1, pvp: 1, role: 'economy', note: 'big accuracy, handling and reload — but only while standing still' },

  // --- PvP dueling (role: utility for PvE purposes) ---
  'Kill Clip': { axes: { tempo: 1, cadence: 1 }, pve: 1, pvp: 3, role: 'dps', note: 'reload after a kill for a damage spike — a Crucible one-tap enabler' },
  Desperado: { axes: { tempo: 1 }, pve: 1, pvp: 3, role: 'utility', note: 'precision kills crank pulse-rifle fire rate' },
  Headseeker: { axes: { range: -1 }, pve: 0, pvp: 3, role: 'utility', note: 'body shots boost your follow-up headshot — pulse cornerstone' },
  'Eye of the Storm': { axes: { soul: 1, tempo: 1 }, pve: 0, pvp: 3, role: 'utility', note: 'gets better the lower your health — clutch perk' },
  Rampage: { axes: { tempo: 2, cadence: 1 }, pve: 1, pvp: 2, role: 'dps', note: 'stacks damage as you chain kills — keeps you on offense' },
  Swashbuckler: { axes: { tempo: 2, range: 1 }, pve: 2, pvp: 2, role: 'dps', note: 'melee or weapon kills spike damage — a close-range monster' },
  'Opening Shot': { axes: { range: -2, soul: -1, engine: -1 }, pve: 0, pvp: 2, role: 'utility', note: 'first shot of a fight gets bonus range and accuracy' },
  Rangefinder: { axes: { range: -2, engine: -1 }, pve: 0, pvp: 2, role: 'utility', note: 'extends effective range while aiming' },
  'Precision Instrument': { axes: { range: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'consecutive precision hits ramp damage — rewards pure aim (pairs with Zen Moment)' },
  'Lone Wolf': { axes: { range: -1, soul: -1 }, pve: 0, pvp: 2, role: 'utility', note: 'solo bonus to range, handling and reload — for the lone-wolf duelist' },
  'Fragile Focus': { axes: { range: -2, engine: -1 }, pve: 0, pvp: 2, role: 'utility', note: 'bonus range while your shields hold — strong for ranged duelists' },
  'Moving Target': { axes: { tempo: 1, range: 1 }, pve: 0, pvp: 2, role: 'utility', note: 'better strafe speed and aim assist while moving' },
  'Killing Wind': { axes: { tempo: 1, range: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'a kill grants range, handling and speed' },
  Slideways: { axes: { tempo: 1, soul: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'slide to reload and gain stability — for the aggressive push' },
  Kickstart: { axes: { tempo: 2 }, pve: 1, pvp: 2, role: 'utility', note: 'slide into a faster, harder-hitting charged shot' },
  'Tap the Trigger': { axes: { tempo: 1, range: 1 }, pve: 0, pvp: 2, role: 'utility', note: 'tightens the first burst — for fusions and shotguns' },
  'Explosive Payload': { axes: { range: -1, soul: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'rounds deal bonus area damage — consistent chip at range' },
  'Snapshot Sights': { axes: { range: -1, soul: 1, engine: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'lightning-fast ADS — duels and quickscopes' },

  // --- Gunfeel / control (Gunslinger-friendly, role: utility) ---
  'Zen Moment': { axes: { range: -1, soul: -1, engine: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'damage dealt tightens recoil — pure control, especially strong on controller' },
  'Rapid Hit': { axes: { range: -1, soul: -1, engine: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'precision hits boost reload and stability' },
  'Dynamic Sway Reduction': { axes: { soul: -1, engine: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'sustained fire tightens accuracy — a feel perk' },
  'Perpetual Motion': { axes: { tempo: 1, soul: -1, engine: -1 }, pve: 1, pvp: 2, role: 'utility', note: 'stat boost while you keep moving' },

  // --- Point-blank (mismatch for ranged/mobile players, role: utility) ---
  'Threat Detector': { axes: { range: 2 }, pve: 1, pvp: 1, role: 'utility', note: 'buffs reload and stability when enemies are close — rewards point-blank' },

  // --- Added from live research (Renegades/Heresy era + vault coverage) ---
  'Detonator Beam': { axes: { cadence: -1 }, pve: 3, pvp: 1, role: 'dps', note: 'sustained trace fire detonates AoE around the target (~30% more) — turns traces into Major/Champion DPS' },
  Demoralize: { axes: { engine: 1 }, pve: 3, pvp: 1, role: 'addclear', element: 'void', note: 'precision final blows Weaken nearby foes (+15% damage taken) — Void add-clear, pairs with Destabilizing Rounds' },
  'Rolling Storm': { axes: { engine: 1 }, pve: 3, pvp: 1, role: 'addclear', element: 'arc', note: 'builds Bolt Charge, then unleashes Arc damage — strong Arc add-clear' },
  'Jolting Feedback': { axes: { engine: 1 }, pve: 3, pvp: 1, role: 'addclear', element: 'arc', note: 'rapid hits jolt the target — chains Arc damage between enemies' },
  Butterfly: { axes: { range: -1 }, pve: 2, pvp: 1, role: 'addclear', note: 'aim briefly, then your next final blow makes the target explode — rewards precision' },
  'Chill Clip': { axes: {}, pve: 2, pvp: 2, role: 'survival', element: 'stasis', note: 'shots apply Slow and can Freeze — Stasis crowd-control and a safety/uptime staple' },
  'Crystalline Corpsebloom': { axes: {}, pve: 2, pvp: 0, role: 'addclear', element: 'stasis', note: 'Stasis final blows spawn crystals for shatter damage and Frost' },
  'Supercharged Magazine': { axes: { engine: 1 }, pve: 2, pvp: 0, role: 'economy', element: 'arc', note: 'while Amplified, ammo reloads from reserves — Arc-build uptime' },
  'Shoot to Loot': { axes: { range: -1 }, pve: 2, pvp: 0, role: 'economy', note: 'shoot ammo bricks to grab them at range — feeds you and the team' },
  'Lead from Gold': { axes: {}, pve: 1, pvp: 0, role: 'economy', note: 'heavy-ammo bricks reload this weapon from reserves' },
  'Grave Robber': { axes: { range: 1 }, pve: 2, pvp: 1, role: 'economy', note: 'melee kills reload the mag — fuel for close, punchy play' },
  'Sleight of Hand': { axes: {}, pve: 2, pvp: 1, role: 'dps', note: 'melee final blows boost handling, reload and damage' },
  'Auto-Loading Holster': { axes: {}, pve: 2, pvp: 1, role: 'economy', note: 'stow to auto-reload — perfect for DPS swap rotations' },
  'Closing Time': { axes: { range: 1 }, pve: 1, pvp: 2, role: 'utility', note: 'near-empty mag boosts handling and reload' },
  Adagio: { axes: { cadence: 1 }, pve: 2, pvp: 1, role: 'dps', note: 'a kill trades fire rate for +20-27% damage' },
  'Box Breathing': { axes: { range: -1 }, pve: 2, pvp: 2, role: 'dps', note: 'aim without firing for a big precision-damage spike — sniper/scout staple' },
  'Feeding Frenzy': { axes: {}, pve: 2, pvp: 1, role: 'economy', note: 'rapid kills ramp reload speed' },
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
  const focus = mode === 'pve' ? topFocus(profile) : null;
  return {
    summary: summaryText(c, mode, focus),
    frames: frameFit(c),
    seek: rankPerks(c, 'seek', mode, focus),
    avoid: rankPerks(c, 'avoid', mode, focus),
    focus,
    focusLabel: focus ? FOCUS_LABEL[focus] : null,
  };
}

const FOCUS_LABEL = {
  addclear: 'Add-clear / killing sprees',
  dps: 'Majors & boss DPS',
  survival: 'Survivability & support',
};

// The PvE job the player leans into hardest (or null if they didn't say).
function topFocus(profile) {
  const f = profile?.pve?.focus || {};
  let best = null;
  for (const k of ['addclear', 'dps', 'survival']) {
    if (best === null || (f[k] || 0) > (f[best] || 0)) best = k;
  }
  return best && (f[best] || 0) > 0 ? best : null;
}

function dirOf(c) {
  const d = {};
  for (const k of Object.keys(AXES)) d[k] = (c[k] ?? 50) - 50;
  return d;
}

function rankPerks(c, kind, mode, focus) {
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
      return { name, fit, topAxis, note: d.note, power: d[mode], role: d.role };
    });

  if (kind === 'seek') {
    // Power dominates; a PvE focus match jumps a tier; fit breaks remaining ties.
    return scored
      .filter((p) => p.power >= 2)
      .map((p) => ({
        ...p,
        chase: p.power * 15 + (focus && p.role === focus ? 16 : 0) + clamp(p.fit, 8),
      }))
      .sort((a, b) => b.chase - a.chase)
      .slice(0, 4)
      .map((p) => ({ name: p.name, why: whySeek(p, c) }));
  }
  // Avoid: only niche perks (power <= 1) that actively fight your style.
  // Economy perks are universally useful in PvE, so never flag them there.
  return scored
    .filter((p) => p.power <= 1 && p.fit < -8)
    .filter((p) => !(mode === 'pve' && p.role === 'economy'))
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

function summaryText(c, mode, focus) {
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

  let focusLine = '';
  if (mode === 'pve' && focus) {
    const map = {
      addclear: ' Your endgame focus is add-clear — you want perks that turn one kill into a whole room.',
      dps: ' Your endgame focus is single-target damage — you want perks that delete majors and bosses.',
      survival: ' Your endgame focus is staying alive and supporting — you want perks that keep you (and the team) up.',
    };
    focusLine = map[focus] || '';
  }

  return `In ${label}, ${tempo}, ${range}, and ${soul}.${tension}${engineLine}${focusLine}`;
}
