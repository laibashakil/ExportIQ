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
  updateDoc,
  getDoc,
  setDoc,
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

/**
 * Persist that the user "sent" a generated document (e.g. a buyer email).
 * Stored at the document level inside the report's `documents` array so the
 * Sent badge survives navigating away and coming back.
 *
 * The report is a single document at /factories/{id}/reports/latest with the
 * documents array embedded. We patch that array in place.
 */
export async function markDocumentSent(factoryId, documentId) {
  if (!factoryId || !documentId) return;
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const docs = Array.isArray(data.documents) ? data.documents : [];
  let changed = false;
  const next = docs.map((d) => {
    if ((d.document_id || d.id) === documentId && !d.sent) {
      changed = true;
      return { ...d, sent: true, sent_at: new Date().toISOString() };
    }
    return d;
  });
  if (changed) {
    await updateDoc(ref, { documents: next });
  }
}

/**
 * Overwrite a single gap inside the report's gaps[] by matching on either
 * a stable id field or a (regulation, requirement) tuple. Used by the
 * one-shot dev tool to repair the empty-title gap for fwi_fsd_001.
 */
export async function patchGap(factoryId, matcher, patch) {
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data() || {};
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  let changed = false;
  const next = gaps.map((g) => {
    if (matcher(g)) {
      changed = true;
      return { ...g, ...patch };
    }
    return g;
  });
  if (changed) await updateDoc(ref, { gaps: next });
  return changed;
}

export function subscribeActions(factoryId, cb) {
  const q = query(collection(db(), 'factories', factoryId, 'actions'), limit(20));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => console.warn('subscribeActions error', err));
}
