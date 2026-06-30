// Reckoner Combat Assessment — "Doctrine" v2 (mode-split).
// Five bipolar axes. Three are mode-agnostic identity (engine/cadence/soul);
// two split by mode (tempo/range) because players fight PvE and PvP differently.
// Each answer nudges axes toward pole A (+) or pole B (-).
export const AXES = {
  tempo: { a: 'Slayer', b: 'Anchor', desc: 'How you take space' },
  range: { a: 'Knife-fighter', b: 'Sightline', desc: 'Where you win fights' },
  engine: { a: 'Architect', b: 'Gunslinger', desc: 'What wins the fight' },
  cadence: { a: 'Burst', b: 'Sustain', desc: 'Your damage rhythm' },
  soul: { a: 'Showtime', b: 'Bedrock', desc: 'What you optimize for' },
};

export const SHARED_AXES = ['cadence', 'soul'];
export const MODE_AXES = ['tempo', 'range', 'engine'];

// section: 'shared' | 'pve' | 'pvp'. Shared questions touch identity axes;
// pve/pvp questions touch tempo/range and route into that mode's profile.
export const QUESTIONS = [
  // ---- Identity (shared) ----
  {
    section: 'shared',
    q: 'Your damage rhythm:',
    options: [
      { text: 'One massive burst, then swap (linear, rocket, sniper)', axis: { cadence: 2 } },
      { text: 'Mostly burst, with some follow-up', axis: { cadence: 1 } },
      { text: 'Mostly sustained, with the odd spike', axis: { cadence: -1 } },
      { text: 'Relentless uptime that never stops (trace, auto, scout)', axis: { cadence: -2 } },
    ],
  },
  {
    section: 'shared',
    q: 'Pick your highlight clip:',
    options: [
      { text: 'A flashy, improbable, high-skill play', axis: { soul: 2 } },
      { text: 'A stylish play that also worked', axis: { soul: 1 } },
      { text: 'A smart, low-risk play that won the round', axis: { soul: -1 } },
      { text: 'A clean, efficient, deathless run', axis: { soul: -2 } },
    ],
  },
  {
    section: 'shared',
    q: 'Loadout philosophy:',
    options: [
      { text: 'Off-meta and fun, even if it\u2019s worse', axis: { soul: 2 } },
      { text: 'Mostly fun, but it has to be viable', axis: { soul: 1 } },
      { text: 'Mostly meta, with room for a pet pick', axis: { soul: -1 } },
      { text: 'Best-in-slot, optimized, reliable', axis: { soul: -2 } },
    ],
  },

  // ---- PvE ----
  {
    section: 'pve',
    q: 'In PvE, what makes you feel powerful?',
    options: [
      { text: 'An ability loop that never stops — grenade, melee, buffs', axis: { engine: 2 } },
      { text: 'Mostly synergy, backed by solid gunplay', axis: { engine: 1 } },
      { text: 'Mostly the gun, with a little build', axis: { engine: -1 } },
      { text: 'A weapon that just feels perfect', axis: { engine: -2 } },
    ],
  },
  {
    section: 'pve',
    q: 'Your ideal PvE weapon perk:',
    options: [
      { text: 'Feeds my build/loop (Voltshot, Demolitionist, Destabilizing)', axis: { engine: 2 } },
      { text: 'Leans build, but I value reliability', axis: { engine: 1 } },
      { text: 'Leans raw stats, with a little synergy', axis: { engine: -1 } },
      { text: 'Pure handling, reload and damage — no build needed', axis: { engine: -2 } },
    ],
  },
  {
    section: 'pve',
    q: 'In a GM Nightfall, your role is:',
    options: [
      { text: 'Front-line — making space, drawing aggro, melee plays', axis: { tempo: 2 } },
      { text: 'Forward, but I pick my pushes', axis: { tempo: 1 } },
      { text: 'Back-ish, stepping up when needed', axis: { tempo: -1 } },
      { text: 'Anchor the back, control the room methodically', axis: { tempo: -2 } },
    ],
  },
  {
    section: 'pve',
    q: 'Clearing a packed room of adds, you want to be:',
    options: [
      { text: 'In the mix — close-range fusions, shotguns, swords', axis: { range: 2, tempo: 1 } },
      { text: 'Picking them off from range — scout, pulse, wave-clear', axis: { range: -2 } },
    ],
  },
  {
    section: 'pve',
    q: 'Your PvE comfort zone:',
    options: [
      { text: 'Wade in — abilities and melee carry me', axis: { tempo: 2, range: 1 } },
      { text: 'Set up, hold, and control the lane', axis: { tempo: -1, range: -1 } },
    ],
  },
  {
    section: 'pve',
    q: 'Boss damage, you\u2019d rather:',
    options: [
      { text: 'Burst it down fast and swap off', axis: { range: 0 } },
      { text: 'Sit in a safe lane and chip sustained damage', axis: { range: -1 } },
    ],
  },
  {
    section: 'pve',
    q: 'In a tough endgame encounter, what do you focus on most?',
    options: [
      { text: 'The adds — keep the room clear', focus: { addclear: 2 } },
      { text: 'The highest-health targets — majors and the boss', focus: { dps: 2 } },
      { text: 'Staying alive and keeping the team up', focus: { survival: 2 } },
      { text: 'The mechanics — I run the encounter', focus: { survival: 1, addclear: 1 } },
    ],
  },
  {
    section: 'pve',
    q: 'Your favorite kind of PvE weapon mostly:',
    options: [
      { text: 'Wipes whole rooms of adds', focus: { addclear: 2 } },
      { text: 'Deletes bosses and majors', focus: { dps: 2 } },
      { text: 'Keeps me alive and topped off', focus: { survival: 2 } },
    ],
  },
  {
    section: 'pve',
    q: 'When a build comes together, the payoff you chase is:',
    options: [
      { text: 'Endless chain-reaction add-clear', focus: { addclear: 2 } },
      { text: 'Massive single-target damage', focus: { dps: 2 } },
      { text: 'Becoming unkillable', focus: { survival: 2 } },
    ],
  },

  // ---- PvP ----
  {
    section: 'pvp',
    q: 'In PvP, what wins your fights?',
    options: [
      { text: 'My build — abilities, class synergy, debuffs', axis: { engine: 2 } },
      { text: 'Mostly build, backed by my aim', axis: { engine: 1 } },
      { text: 'Mostly aim, with a little build', axis: { engine: -1 } },
      { text: 'Pure gunskill — the weapon has to feel perfect', axis: { engine: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'Your ideal PvP weapon perk:',
    options: [
      { text: 'Build and ability synergy', axis: { engine: 2 } },
      { text: 'A bit of synergy, mostly feel', axis: { engine: 1 } },
      { text: 'Mostly feel, the odd bit of synergy', axis: { engine: -1 } },
      { text: 'Pure gunfeel — reload, handling, range', axis: { engine: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'Your Crucible instinct when you spot someone:',
    options: [
      { text: 'Close the gap — pressure, melee, take the duel', axis: { tempo: 2 } },
      { text: 'Press the advantage when I have it', axis: { tempo: 1 } },
      { text: 'Hold unless I\u2019m sure of the trade', axis: { tempo: -1 } },
      { text: 'Reposition for a clean, pre-aimed shot', axis: { tempo: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'Where you actually win duels:',
    options: [
      { text: 'Up close — shotgun, fusion, SMG', axis: { range: 2 } },
      { text: 'Mid-range — hand cannon, pulse trades', axis: { range: 0 } },
      { text: 'Out at the lanes — scout, sniper, precision', axis: { range: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'An enemy rushes you with a shotgun. You:',
    options: [
      { text: 'Meet them head-on and out-duel up close', axis: { range: 2 } },
      { text: 'Trade close if I have to', axis: { range: 1 } },
      { text: 'Give ground and keep my spacing', axis: { range: -1 } },
      { text: 'Back up and out-space them with range', axis: { range: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'Be honest — your aggression in PvP:',
    options: [
      { text: 'Aggressive — I hunt kills and melee plays', axis: { tempo: 2 } },
      { text: 'Assertive — I push good odds', axis: { tempo: 1 } },
      { text: 'Measured — I wait for the opening', axis: { tempo: -1 } },
      { text: 'Disciplined — patience wins the round', axis: { tempo: -2 } },
    ],
  },
  {
    section: 'pvp',
    q: 'Your real edge in the Crucible:',
    options: [
      { text: 'Mechanics and flash — I make the hard play', axis: { soul: 2 } },
      { text: 'A bit of flair, mostly fundamentals', axis: { soul: 1 } },
      { text: 'Steady fundamentals with the odd highlight', axis: { soul: -1 } },
      { text: 'Precision and positioning — consistent, every time', axis: { soul: -2 } },
    ],
  },
];
