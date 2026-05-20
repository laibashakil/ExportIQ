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

/**
 * Flip the report's `simulation_revealed` flag. When true, the mobile
 * Compliance screen switches its gauge from the original pre-simulation
 * score to the post-simulation score and renders all gaps / contradictions
 * as resolved. Default is always false (set by orchestrator at report
 * creation time).
 */
export async function setSimulationRevealed(factoryId, revealed) {
  if (!factoryId) return;
  const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
  await updateDoc(ref, {
    simulation_revealed: !!revealed,
    simulation_revealed_at: revealed ? new Date().toISOString() : null,
  });
}

/**
 * Persist an edited buyer email back into the report's documents array.
 * Matches by document_id; the new title (subject) and body replace the
 * existing values and `edited_at` is set.
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
 * Interactive checklist persistence.
 * Stored at /factories/{id}/checklists/{checklistId} (top-level doc with
 * a `progress` summary) and /factories/{id}/checklists/{checklistId}/items/{itemId}
 * (one doc per checklist item with `done` boolean).
 */
export function subscribeChecklistItems(factoryId, checklistId, cb) {
  const ref = collection(db(), 'factories', factoryId, 'checklists', checklistId, 'items');
  return onSnapshot(ref, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => console.warn('subscribeChecklistItems error', err));
}

export async function seedChecklistItems(factoryId, checklistId, parsedItems) {
  // Only writes if the collection is empty — idempotent first-open seeding.
  const colRef = collection(db(), 'factories', factoryId, 'checklists', checklistId, 'items');
  const summary = doc(db(), 'factories', factoryId, 'checklists', checklistId);
  const existing = await getDoc(summary);
  if (existing.exists()) return;
  for (let i = 0; i < parsedItems.length; i += 1) {
    const item = parsedItems[i];
    const itemRef = doc(db(), 'factories', factoryId, 'checklists', checklistId, 'items', String(i));
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
  const itemRef = doc(db(), 'factories', factoryId, 'checklists', checklistId, 'items', String(itemId));
  await updateDoc(itemRef, { done: !!done, updated_at: new Date().toISOString() });
}

export function subscribeActions(factoryId, cb) {
  const q = query(collection(db(), 'factories', factoryId, 'actions'), limit(20));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    cb(items);
  }, (err) => console.warn('subscribeActions error', err));
}
