// Tracks which deadline notifications the user has already seen.
//
// Persistence: AsyncStorage (device-local). The set is keyed by a stable
// deadlineId() derived from the gap; gap_id is used when present, otherwise
// a (regulation, deadline, title) hash so the same logical deadline survives
// re-analyses with reshuffled UUIDs.
//
// Public API:
//   await loadOnce()                — ensure the in-memory cache is hydrated
//   subscribe(cb) -> unsub          — pub/sub for read-set changes
//   getReadSet()                    — Set<string> (in-memory, sync)
//   markRead(ids: string[])         — adds ids, persists, fires subscribers
//   deadlineId(factoryId, gap)      — stable id helper
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'exportiq.notifications.read.v1';

let readSet = new Set();
let loaded = false;
let loadPromise = null;
const subscribers = new Set();

function fire() {
  for (const cb of subscribers) {
    try {
      cb(readSet);
    } catch {
      // swallow — listener errors must not break others
    }
  }
}

export function deadlineId(factoryId, gap) {
  if (!gap) return `${factoryId}:unknown`;
  const stable =
    gap.gap_id
    || `${gap.regulation || 'reg'}|${gap.deadline || 'd'}|${gap.requirement || gap.display_title || ''}`;
  return `${factoryId}:${stable}`;
}

export async function loadOnce() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) readSet = new Set(arr);
      }
    } catch {
      readSet = new Set();
    } finally {
      loaded = true;
      loadPromise = null;
      fire();
    }
  })();
  return loadPromise;
}

export function getReadSet() {
  return readSet;
}

export function subscribe(cb) {
  subscribers.add(cb);
  // Deliver current snapshot once, so callers don't have to debounce a first-paint flash.
  cb(readSet);
  return () => subscribers.delete(cb);
}

export async function markRead(ids) {
  if (!ids || !ids.length) return;
  await loadOnce();
  let changed = false;
  for (const id of ids) {
    if (!readSet.has(id)) {
      readSet.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...readSet]));
  } catch {
    // non-fatal — in-memory state still reflects the change
  }
  fire();
}

/** Test/dev helper — clears the entire read set (not currently wired to UI). */
export async function clearReadSet() {
  readSet = new Set();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  fire();
}
