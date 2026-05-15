// Firestore singletons + real-time listeners used by the screens.
// Each screen subscribes to a tiny slice of /factories/{id} or /jobs/{id}
// so judges watching the demo see live updates flow in.
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

import { FIREBASE_CONFIG } from '../constants/config';

function ensureApp() {
  if (!getApps().length) {
    return initializeApp(FIREBASE_CONFIG);
  }
  return getApps()[0];
}

let _db = null;
export function db() {
  if (!_db) {
    _db = getFirestore(ensureApp());
  }
  return _db;
}

export function subscribeFactory(factoryId, cb) {
  const ref = doc(db(), 'factories', factoryId);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.warn('subscribeFactory error', err));
}

export function subscribeReport(factoryId, cb) {
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => console.warn('subscribeReport error', err));
}

export function subscribeJob(jobId, cb) {
  const ref = doc(db(), 'jobs', jobId);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => console.warn('subscribeJob error', err));
}

export function subscribeActions(factoryId, cb) {
  const q = query(collection(db(), 'factories', factoryId, 'actions'), limit(20));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => console.warn('subscribeActions error', err));
}
