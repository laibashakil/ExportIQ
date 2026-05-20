import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
} from 'firebase/firestore';

import { FIREBASE_CONFIG } from '../constants/config';

function ensureApp() {
  if (!getApps().length) return initializeApp(FIREBASE_CONFIG);
  return getApps()[0];
}

let _db = null;
export function db() {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export function subscribeFactory(factoryId, cb) {
  const ref = doc(db(), 'factories', factoryId);
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.warn('subscribeFactory error', err),
  );
}

export function subscribeReport(factoryId, cb) {
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => console.warn('subscribeReport error', err),
  );
}

export function subscribeJob(jobId, cb) {
  const ref = doc(db(), 'jobs', jobId);
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => console.warn('subscribeJob error', err),
  );
}
