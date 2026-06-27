// Bungie manifest ingestion + cache.
// Downloads DestinyInventoryItemDefinition once, slims it to weapons + plugs
// (perks), and caches it in IndexedDB keyed by manifest version. On later loads
// it version-checks and reuses the cache unless Bungie ships a new manifest.
import { CONFIG } from './config.js';

const DB_NAME = 'reckoner';
const STORE = 'manifest';
const KEY = 'items';
const WEAPON_ITEM_TYPE = 3;
// Bump when slim()'s shape changes, so stale caches (e.g. missing plugCategory)
// are discarded and the manifest is re-processed.
const SCHEMA = 3;

// ---- public API ------------------------------------------------------------

// Returns a map: { [hash]: slimDef }. Calls onProgress(message) for UI updates.
export async function loadItems(onProgress = () => {}) {
  onProgress('Checking manifest version…');
  const { version, path } = await getManifestInfo();

  const cached = await idbGet(KEY).catch(() => null);
  if (cached && cached.version === version && cached.schema === SCHEMA && cached.items) {
    onProgress('Loading cached manifest…');
    return cached.items;
  }

  onProgress('Downloading Bungie manifest (one-time, ~tens of MB)…');
  const resp = await fetch(`${CONFIG.WORKER_URL}/cdn${path}`);
  if (!resp.ok) throw new Error(`Manifest download failed (${resp.status}).`);
  const full = await resp.json();

  onProgress('Processing weapons & perks…');
  const items = {};
  for (const hash in full) {
    const def = full[hash];
    if (def.itemType === WEAPON_ITEM_TYPE || def.plug) {
      items[hash] = slim(def);
    }
  }

  await idbPut(KEY, { version, schema: SCHEMA, items }).catch(() => {
    /* cache write is best-effort; tool still works without it */
  });
  return items;
}

// ---- manifest metadata -----------------------------------------------------

async function getManifestInfo() {
  const resp = await fetch(`${CONFIG.WORKER_URL}/api/Destiny2/Manifest/`);
  const data = await resp.json();
  const r = data.Response;
  if (!r) throw new Error('Could not read manifest metadata.');
  const path = r.jsonWorldComponentContentPaths?.en?.DestinyInventoryItemDefinition;
  if (!path) throw new Error('Manifest item-definition path not found.');
  return { version: r.version, path };
}

function slim(def) {
  return {
    name: def.displayProperties?.name ?? '',
    description: def.displayProperties?.description ?? '',
    itemType: def.itemType,
    itemSubType: def.itemSubType,
    typeName: def.itemTypeDisplayName ?? '',
    tier: def.inventory?.tierType,
    socketCategories: def.sockets?.socketCategories ?? null,
    plugCategory: def.plug?.plugCategoryIdentifier ?? null,
    icon: def.displayProperties?.icon ?? null,
    damageType: def.defaultDamageType ?? 0,
  };
}

// ---- tiny IndexedDB wrapper ------------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
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
