// Scores assessment answers into mode-split positions (0-100 per axis; 50 =
// neutral, 100 = pole A). Identity axes (engine/cadence/soul) are shared;
// tempo/range are stored per mode. Also derives per-mode archetype titles.
import { AXES, QUESTIONS, SHARED_AXES, MODE_AXES } from './questions.js';

const KEY = 'reckoner_profile';

// answers: array of { section, axis } (the chosen option plus its question's section).
export function scoreAnswers(answers) {
  const totals = { shared: {}, pve: {}, pvp: {} };
  const maxes = { shared: {}, pve: {}, pvp: {} };
  for (const a of SHARED_AXES) {
    totals.shared[a] = 0;
    maxes.shared[a] = 0;
  }
  for (const m of ['pve', 'pvp']) {
    for (const a of MODE_AXES) {
      totals[m][a] = 0;
      maxes[m][a] = 0;
    }
  }

  // Max possible magnitude per (bucket, axis), from the questions themselves.
  for (const q of QUESTIONS) {
    const per = {};
    for (const opt of q.options) {
      for (const [k, v] of Object.entries(opt.axis || {})) {
        per[k] = Math.max(per[k] ?? 0, Math.abs(v));
      }
    }
    for (const [k, v] of Object.entries(per)) bucketAdd(maxes, q.section, k, v);
  }

  for (const a of answers) {
    for (const [k, v] of Object.entries(a?.axis || {})) bucketAdd(totals, a.section, k, v);
  }

  // PvE focus (add-clear / dps / survival) accrues separately from the axes.
  const focus = { addclear: 0, dps: 0, survival: 0 };
  for (const a of answers) {
    for (const [k, v] of Object.entries(a?.focus || {})) {
      if (k in focus) focus[k] += v;
    }
  }

  const pve = convert(totals.pve, maxes.pve);
  pve.focus = focus;

  return {
    shared: convert(totals.shared, maxes.shared),
    pve,
    pvp: convert(totals.pvp, maxes.pvp),
  };
}

function bucketAdd(store, section, axis, value) {
  if (SHARED_AXES.includes(axis)) {
    store.shared[axis] += value;
  } else if (MODE_AXES.includes(axis)) {
    const b = section === 'pvp' ? 'pvp' : section === 'pve' ? 'pve' : null;
    if (b) store[b][axis] += value;
  }
}

function convert(totals, maxes) {
  const out = {};
  for (const k of Object.keys(totals)) {
    const m = maxes[k] || 1;
    out[k] = Math.max(0, Math.min(100, Math.round(50 + (totals[k] / m) * 50)));
  }
  return out;
}

// Full five-axis view for a given mode: shared identity + that mode's tempo/range.
export function combined(profile, mode) {
  return { ...(profile.shared || {}), ...(profile[mode] || {}) };
}

// Title that pairs the strongest MODE axis (tempo/range — differentiates PvE
// from PvP) with the strongest IDENTITY axis (engine/cadence/soul).
export function archetype(profile, mode) {
  const c = combined(profile, mode);
  const pick = (keys) => {
    let best = null;
    for (const k of keys) {
      if (!(k in c)) continue;
      const dev = Math.abs(c[k] - 50);
      if (!best || dev > best.dev) best = { k, dev, pole: c[k] >= 50 ? 'a' : 'b' };
    }
    return best;
  };
  const modePick = pick(MODE_AXES);
  const idPick = pick(SHARED_AXES);
  const word = (d) => AXES[d.k][d.pole];

  const haveMode = modePick && modePick.dev >= 8;
  const haveId = idPick && idPick.dev >= 8;
  if (!haveMode && !haveId) return 'The Generalist';
  if (!haveMode) return `The ${word(idPick)}`;
  if (!haveId) return `The ${word(modePick)}`;
  return `The ${word(modePick)} ${word(idPick)}`;
}

export function isValid(profile) {
  return !!(profile && profile.shared && profile.pve && profile.pvp);
}

export function saveProfile(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    return isValid(p) ? p : null;
  } catch {
    return null;
  }
}
