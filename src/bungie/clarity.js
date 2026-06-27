// Clarity community perk database.
// Authoritative, number-backed descriptions for (nearly) every perk in the game,
// keyed by Bungie hash and maintained by the Clarity team. We fetch the
// DIM-formatted descriptions, flatten the rich-text blocks to plain text, and
// index them by perk name so the engine can describe ANY perk it encounters —
// not just the ones hand-curated in the doctrine model. Cached in IndexedDB and
// refreshed only when Clarity ships a new version.
//
// Data: github.com/Database-Clarity/Live-Clarity-Database (branch 'live').
// raw.githubusercontent.com is CORS-open, so the browser fetches it directly.

const BASE = 'https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live';
const VERSIONS_URL = `${BASE}/versions.json`;
const DESCRIPTIONS_URL = `${BASE}/descriptions/dim.json`;

const DB_NAME = 'reckoner';
const STORE = 'manifest'; // shares the manifest object store
const KEY = 'clarity';

// Returns a Map: lowercased perk name -> plain-text description.
// Never throws — Clarity is an enrichment layer, so any failure degrades to an
// empty map (or the last cached copy) and the app keeps working.
export async function loadClarity(onProgress = () => {}) {
  let version = null;
  try {
    const v = await fetch(VERSIONS_URL).then((r) => r.json());
    version = v?.descriptions ?? null;
  } catch {
    /* offline or blocked — fall back to whatever is cached */
  }

  const cached = await idbGet(KEY).catch(() => null);
  if (cached?.byName && (version == null || cached.version === version)) {
    return new Map(cached.byName);
  }

  onProgress('Loading Clarity perk database\u2026');
  let raw;
  try {
    raw = await fetch(DESCRIPTIONS_URL).then((r) => r.json());
  } catch {
    return cached?.byName ? new Map(cached.byName) : new Map();
  }

  const byName = new Map();
  for (const hash in raw) {
    const entry = raw[hash];
    const text = flatten(entry);
    if (!text) continue;
    const key = (entry.name || '').toLowerCase();
    if (key && !byName.has(key)) byName.set(key, text);
  }

  await idbPut(KEY, { version, byName: [...byName] }).catch(() => {
    /* cache write is best-effort */
  });
  return byName;
}

// Clarity descriptions are rich-text: descriptions.en is an array of blocks,
// each block either a { linesContent: [{ text }, { classNames }] } line or a
// { classNames: ['spacer'] } break. classNames-only segments are element/colour
// markers with no text — we keep just the text and join into a readable string.
function flatten(entry) {
  const en = entry?.descriptions?.en;
  if (!Array.isArray(en)) return '';
  const parts = [];
  for (const block of en) {
    if (Array.isArray(block?.linesContent)) {
      const line = block.linesContent.map((s) => s?.text || '').join('').trim();
      if (line) parts.push(line);
    }
  }
  return parts.join(' ');
}

// ---- tiny IndexedDB wrapper (shares the manifest DB/store) -----------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
