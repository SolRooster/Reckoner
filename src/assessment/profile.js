// Scores assessment answers into a 0-100 position per axis (50 = neutral,
// 100 = pole A), derives an archetype title, and persists the profile locally.
import { AXES, QUESTIONS } from './questions.js';

const KEY = 'reckoner_profile';

// answers: array of chosen option objects (each with an `axis` map).
export function scoreAnswers(answers) {
  const totals = {};
  const maxes = {};
  for (const k of Object.keys(AXES)) {
    totals[k] = 0;
    maxes[k] = 0;
  }

  // Max possible magnitude per axis, from the questions themselves.
  for (const q of QUESTIONS) {
    const perAxis = {};
    for (const opt of q.options) {
      for (const [k, v] of Object.entries(opt.axis || {})) {
        perAxis[k] = Math.max(perAxis[k] ?? 0, Math.abs(v));
      }
    }
    for (const [k, v] of Object.entries(perAxis)) maxes[k] += v;
  }

  for (const opt of answers) {
    for (const [k, v] of Object.entries(opt?.axis || {})) totals[k] += v;
  }

  const profile = {};
  for (const k of Object.keys(AXES)) {
    const m = maxes[k] || 1;
    const pos = Math.round(50 + (totals[k] / m) * 50);
    profile[k] = Math.max(0, Math.min(100, pos));
  }
  return profile;
}

// Title from the two axes that deviate most from neutral.
export function archetype(profile) {
  const devs = Object.keys(AXES).map((k) => ({
    k,
    dev: Math.abs(profile[k] - 50),
    pole: profile[k] >= 50 ? 'a' : 'b',
  }));
  devs.sort((x, y) => y.dev - x.dev);
  const [first, second] = devs;
  if (!first || first.dev < 8) return 'The Generalist';
  const word = (d) => AXES[d.k][d.pole];
  return `The ${word(second)} ${word(first)}`;
}

export function saveProfile(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
