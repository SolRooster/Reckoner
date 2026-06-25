// Reckoner Combat Assessment — "Doctrine".
// Five bipolar axes. Each answer nudges one or more axes toward pole A (+) or B (-).
export const AXES = {
  tempo: { a: 'Slayer', b: 'Anchor', desc: 'how you take space' },
  range: { a: 'Knife-fighter', b: 'Sightline', desc: 'where you win fights' },
  engine: { a: 'Architect', b: 'Gunslinger', desc: 'what wins the fight' },
  cadence: { a: 'Burst', b: 'Sustain', desc: 'your damage rhythm' },
  soul: { a: 'Showtime', b: 'Bedrock', desc: 'what you optimize for' },
};

export const QUESTIONS = [
  {
    q: 'Control match, heavy ammo just spawned mid-map. Your instinct:',
    options: [
      { text: 'Sprint it down and fight anyone who contests', axis: { tempo: 2 } },
      { text: 'Hold a sightline and punish whoever grabs it', axis: { tempo: -2, range: -1 } },
      { text: 'Let a teammate take it — I cover and trade', axis: { tempo: -1, engine: 1 } },
    ],
  },
  {
    q: 'Your ideal engagement distance:',
    options: [
      { text: 'In their face — fusion, shotgun, SMG', axis: { range: 2 } },
      { text: 'Mid-range — pulses and hand cannons', axis: { range: 0 } },
      { text: 'Across the map — scouts and snipers', axis: { range: -2 } },
    ],
  },
  {
    q: 'What actually makes you feel powerful?',
    options: [
      { text: 'An ability loop that never stops — grenade, melee, buffs', axis: { engine: 2 } },
      { text: 'A gun that just feels perfect in my hands', axis: { engine: -2 } },
    ],
  },
  {
    q: 'Boss DPS phase. Your dream weapon:',
    options: [
      { text: 'One massive burst, then swap (linear, rocket, Sleeper)', axis: { cadence: 2 } },
      { text: 'Relentless uptime that never stops (trace, MG, auto)', axis: { cadence: -2 } },
    ],
  },
  {
    q: 'Pick your highlight clip:',
    options: [
      { text: 'A flashy, improbable, high-skill play', axis: { soul: 2 } },
      { text: 'A clean, efficient, deathless run', axis: { soul: -2 } },
    ],
  },
  {
    q: 'When you die in Crucible, it\u2019s usually because you:',
    options: [
      { text: 'Pushed too aggressive', axis: { tempo: 1 } },
      { text: 'Held too passive and got out-traded', axis: { tempo: -1 } },
    ],
  },
  {
    q: 'Halo nostalgia — your Reach / H3 identity was:',
    options: [
      { text: 'Objective + utility: nades, equipment, map control', axis: { engine: 1, tempo: -1 } },
      { text: 'BR/DMR precision dueling', axis: { engine: -1, range: -1 } },
    ],
  },
  {
    q: 'The Division hooked you because of:',
    options: [
      { text: 'Theorycrafting builds and gear synergy', axis: { engine: 2 } },
      { text: 'The gunfeel and cover-to-cover combat', axis: { engine: -1 } },
      { text: 'Never really played it', axis: {} },
    ],
  },
  {
    q: 'Your weapon fantasy:',
    options: [
      { text: 'Precision marksman — every shot counts', axis: { cadence: 1, range: -1 } },
      { text: 'Spray and sustain — drown them in bullets', axis: { cadence: -1, range: 1 } },
    ],
  },
  {
    q: 'Loadout philosophy:',
    options: [
      { text: 'Best-in-slot meta, fully optimized', axis: { soul: -1 } },
      { text: 'Off-meta stuff that\u2019s fun even if it\u2019s worse', axis: { soul: 1 } },
      { text: 'Whatever makes my fireteam stronger', axis: { engine: 1 } },
    ],
  },
  {
    q: 'In a GM Nightfall, your role is:',
    options: [
      { text: 'Front-line — making space, drawing aggro', axis: { tempo: 1 } },
      { text: 'Anchor the back, control the room methodically', axis: { tempo: -2 } },
    ],
  },
  {
    q: 'The gun you\u2019d never delete:',
    options: [
      { text: 'A fusion/shotgun that deletes up close', axis: { range: 1, cadence: 1 } },
      { text: 'A scout/pulse that owns the lane', axis: { range: -1, cadence: -1 } },
    ],
  },
];
