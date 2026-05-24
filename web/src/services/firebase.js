import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  getDoc,
  setDoc,
  updateDoc,
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

// --- Document persistence -----------------------------------------------

/**
 * Patch a single document inside report.documents[] by document_id.
 * Mirrors mobile's updateDocument helper.
 */
export async function updateDocument(factoryId, documentId, patch) {
  if (!factoryId || !documentId) return;
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const docs = Array.isArray(data.documents) ? data.documents : [];
  let changed = false;
  const next = docs.map((d) => {
    if ((d.document_id || d.id) === documentId) {
      changed = true;
      return { ...d, ...patch, edited_at: new Date().toISOString() };
    }
    return d;
  });
  if (changed) {
    await updateDoc(ref, { documents: next });
  }
}

/**
 * Flip a document's sent flag inside report.documents[]. Mirrors mobile's
 * markDocumentSent helper.
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

// --- Interactive checklist ---------------------------------------------

export function subscribeChecklistItems(factoryId, checklistId, cb) {
  const ref = collection(db(), 'factories', factoryId, 'checklists', checklistId, 'items');
  return onSnapshot(
    ref,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      cb(items);
    },
    (err) => console.warn('subscribeChecklistItems error', err),
  );
}

export async function seedChecklistItems(factoryId, checklistId, parsedItems) {
  const summary = doc(db(), 'factories', factoryId, 'checklists', checklistId);
  const existing = await getDoc(summary);
  if (existing.exists()) return;
  for (let i = 0; i < parsedItems.length; i += 1) {
    const item = parsedItems[i];
    const itemRef = doc(
      db(),
      'factories',
      factoryId,
      'checklists',
      checklistId,
      'items',
      String(i),
    );
    // eslint-disable-next-line no-await-in-loop
    await setDoc(itemRef, {
      index: i,
      label: item.label,
      template_kind: item.template_kind || null,
      done: false,
    });
  }
  await setDoc(summary, {
    total: parsedItems.length,
    completed: 0,
    created_at: new Date().toISOString(),
  });
}

export async function toggleChecklistItem(factoryId, checklistId, itemId, done) {
  const itemRef = doc(
    db(),
    'factories',
    factoryId,
    'checklists',
    checklistId,
    'items',
    String(itemId),
  );
  await updateDoc(itemRef, { done: !!done, updated_at: new Date().toISOString() });
}
