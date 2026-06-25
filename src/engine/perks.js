// Reckoner perk knowledge base.
// Each trait perk maps to: which modes it serves, an impact weight (1-3),
// and a short Datto-style note used to build the verdict writeup.
//   modes: 'pve' and/or 'pvp'   weight: 3 = meta, 2 = solid, 1 = situational
export const PERKS = {
  // --- Damage / ramp ---
  'Target Lock': { modes: ['pvp', 'pve'], weight: 3, note: 'ramps damage the longer you stay on target' },
  'Kill Clip': { modes: ['pvp', 'pve'], weight: 2, note: 'reload after a kill for a big damage spike' },
  'Rampage': { modes: ['pve'], weight: 2, note: 'stacks damage as you chain kills' },
  'Vorpal Weapon': { modes: ['pve', 'pvp'], weight: 2, note: 'bonus damage to bosses and supers' },
  'Frenzy': { modes: ['pve'], weight: 3, note: 'free damage and reload once a fight gets going, no buildup needed' },
  'One for All': { modes: ['pve'], weight: 2, note: 'hit three targets for a long damage buff' },
  'Killing Tally': { modes: ['pve'], weight: 2, note: 'stacking damage that loves long activities' },
  'Focused Fury': { modes: ['pve'], weight: 2, note: 'half a mag of precision hits flips on bonus damage' },
  'Bait and Switch': { modes: ['pve'], weight: 3, note: 'top-tier DPS if you can swap across all three weapons' },
  'High-Impact Reserves': { modes: ['pve', 'pvp'], weight: 1, note: 'more damage as the mag runs low' },
  'Adrenaline Junkie': { modes: ['pve'], weight: 2, note: 'grenade kills feed weapon damage' },

  // --- Add-clear / explosions ---
  'Chain Reaction': { modes: ['pve'], weight: 3, note: 'every kill triggers an elemental blast — pure add-clear' },
  'Dragonfly': { modes: ['pve'], weight: 2, note: 'precision kills pop an elemental burst' },
  'Firefly': { modes: ['pve'], weight: 1, note: 'precision kills cause an explosion' },
  'Incandescent': { modes: ['pve'], weight: 3, note: 'kills scatter scorch — a Solar add-clear staple' },
  'Voltshot': { modes: ['pve'], weight: 3, note: 'reload-on-kill to jolt the next target' },
  'Destabilizing Rounds': { modes: ['pve'], weight: 2, note: 'kills make targets volatile for chain explosions' },
  'Jolting Feedback': { modes: ['pve'], weight: 2, note: 'rapid hits jolt — built-in Arc chaining' },
  'Hatchling': { modes: ['pve', 'pvp'], weight: 2, note: 'spawns Threadlings on precision/final blows' },
  'Golden Tricorn': { modes: ['pve'], weight: 2, note: 'big damage stack when you mix ability and weapon kills' },

  // --- Reload / economy / uptime ---
  'Reconstruction': { modes: ['pve'], weight: 3, note: 'auto-refills the mag over time — never reload again' },
  'Rewind Rounds': { modes: ['pve'], weight: 2, note: 'refunds the mag based on hits — endless uptime' },
  'Overflow': { modes: ['pve'], weight: 2, note: 'double mag off a brick — great burst before reloading' },
  'Envious Assassin': { modes: ['pve'], weight: 3, note: 'overflows the mag off kills before you swap in — DPS setup' },
  'Subsistence': { modes: ['pve'], weight: 1, note: 'kills top up the mag from reserves' },
  'Demolitionist': { modes: ['pve'], weight: 2, note: 'kills feed your grenade — ability-loop fuel' },
  'Pugilist': { modes: ['pve'], weight: 1, note: 'kills charge your melee' },
  'Field Prep': { modes: ['pve'], weight: 1, note: 'fat reserves and faster reload crouched' },
  'Fourth Time\u2019s the Charm': { modes: ['pve'], weight: 1, note: 'precision hits refund rounds to the mag' },
  "Fourth Time's the Charm": { modes: ['pve'], weight: 1, note: 'precision hits refund rounds to the mag' },
  'Perpetual Motion': { modes: ['pve', 'pvp'], weight: 1, note: 'stat boost while you keep moving' },
  'Stats for All': { modes: ['pve'], weight: 1, note: 'hit multiple targets for an all-around stat bump' },
  'Repulsor Brace': { modes: ['pve'], weight: 2, note: 'Void kills grant an overshield — survivability glue' },

  // --- PvP dueling ---
  'Headseeker': { modes: ['pvp'], weight: 3, note: 'body shots boost your follow-up headshot — a Crucible cornerstone' },
  'Moving Target': { modes: ['pvp'], weight: 2, note: 'better strafe speed and aim assist while strafing' },
  'Opening Shot': { modes: ['pvp'], weight: 2, note: 'first shot of an engagement gets bonus range and accuracy' },
  'Snapshot Sights': { modes: ['pvp'], weight: 2, note: 'lightning-fast ADS — duels and quickscopes' },
  'Eye of the Storm': { modes: ['pvp'], weight: 2, note: 'gets better the lower your health — clutch perk' },
  'Rangefinder': { modes: ['pvp'], weight: 2, note: 'extends effective range while aiming' },
  'Killing Wind': { modes: ['pvp', 'pve'], weight: 2, note: 'a kill grants range, handling and speed' },
  'Zen Moment': { modes: ['pvp', 'pve'], weight: 1, note: 'damage dealt tightens recoil' },
  'Tap the Trigger': { modes: ['pvp'], weight: 1, note: 'tightens the first burst of fire' },
  'Slideshot': { modes: ['pvp', 'pve'], weight: 1, note: 'slide to partially reload and gain range' },
  'Quickdraw': { modes: ['pvp'], weight: 1, note: 'instant ready speed' },
  'Dynamic Sway Reduction': { modes: ['pvp', 'pve'], weight: 1, note: 'sustained fire tightens accuracy' },
  'Encore': { modes: ['pvp'], weight: 1, note: 'kills stack accuracy and range' },
  'Rapid Hit': { modes: ['pvp', 'pve'], weight: 2, note: 'precision hits boost reload and stability' },
  'Explosive Payload': { modes: ['pvp', 'pve'], weight: 2, note: 'rounds deal bonus area damage — consistent chip' },
  'Kinetic Tremors': { modes: ['pve'], weight: 1, note: 'sustained hits send out a damaging shockwave' },
};

// Soft fallback for perks we have not catalogued yet.
export function knows(name) {
  return Object.prototype.hasOwnProperty.call(PERKS, name);
}
