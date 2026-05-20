// Browser version of mobile/services/notificationsRead.js — backed by
// localStorage instead of AsyncStorage. The deadline id format matches
// exactly so a deadline marked read on one client stays semantically
// consistent (though storage is per-device by definition).

const STORAGE_KEY = 'exportiq.read_deadlines.v1';
const listeners = new Set();
let _set = null;

function loadFromStorage() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persist(set) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function notify() {
  for (const cb of listeners) {
    try { cb(_set); } catch {}
  }
}

export function loadReadSet() {
  if (_set === null) _set = loadFromStorage();
  notify();
  return _set;
}

export function subscribeReadSet(cb) {
  listeners.add(cb);
  if (_set === null) _set = loadFromStorage();
  cb(_set);
  return () => listeners.delete(cb);
}

export function markRead(ids) {
  if (_set === null) _set = loadFromStorage();
  const arr = Array.isArray(ids) ? ids : [ids];
  let changed = false;
  for (const id of arr) {
    if (!_set.has(id)) { _set.add(id); changed = true; }
  }
  if (changed) {
    persist(_set);
    notify();
  }
}

export function deadlineId(factoryId, gap) {
  // Mirrors mobile/services/notificationsRead.js so the id is the same
  // whether generated in RN or the browser.
  const reg = gap?.regulation || 'reg';
  const req = gap?.requirement || gap?.title || gap?.display_title || 'gap';
  const due = gap?.deadline || '';
  return `${factoryId}::${reg}::${req}::${due}`;
}
