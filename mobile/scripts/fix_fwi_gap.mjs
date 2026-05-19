// One-shot dev tool: repair the empty-title gap on the fwi_fsd_001 report.
// The gap exists in Firestore with no `requirement` (and possibly a stale
// regulation), which made the Status screen render the bare word
// "Regulation". This script gives it a proper plain-English title.
//
// Usage:  node scripts/fix_fwi_gap.mjs

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCP9EzOhT7k3cuT5NvoQXovnKnzRmGkzm0',
  authDomain: 'exportiq-496416.firebaseapp.com',
  projectId: 'exportiq-496416',
  storageBucket: 'exportiq-496416.firebasestorage.app',
  messagingSenderId: '834278774758',
  appId: '1:834278774758:web:b02dda054471bdb4aa2827',
  measurementId: 'G-VQMDM0830L',
};

const FACTORY_ID = 'fwi_fsd_001';
const NEW_TITLE = 'Renew Labour Standards Certification';

function ensureApp() {
  return getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
}

function isUntitled(g) {
  // The render-time fallback in plainRequirement used to produce "Regulation"
  // when both requirement and regulation were missing/blank. We catch all
  // of those cases here.
  const req = (g.requirement || '').trim();
  const reg = (g.regulation || '').trim();
  if (!req) return true;
  if (req.toLowerCase() === 'regulation') return true;
  if (req.toLowerCase() === 'compliance requirement') return true;
  if (!reg && req.length < 3) return true;
  return false;
}

async function main() {
  const app = ensureApp();
  const db = getFirestore(app);
  const ref = doc(db, 'factories', FACTORY_ID, 'reports', 'latest');

  console.log(`[1] reading /factories/${FACTORY_ID}/reports/latest`);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.error('    report does not exist — nothing to fix');
    process.exit(1);
  }
  const data = snap.data() || {};
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  console.log(`    found ${gaps.length} gap(s)`);

  let changed = 0;
  const next = gaps.map((g, i) => {
    if (isUntitled(g)) {
      changed += 1;
      const patch = {
        ...g,
        regulation: g.regulation || 'SA8000 — Labour Standards',
        requirement: NEW_TITLE,
        status: g.status || 'EXPIRED',
        severity: g.severity || 'HIGH',
      };
      console.log(`    [#${i}] patching: requirement -> "${NEW_TITLE}"`);
      return patch;
    }
    return g;
  });

  if (!changed) {
    console.log('[2] no untitled gaps found — nothing to do.');
    process.exit(0);
  }

  console.log(`[2] writing back ${changed} patched gap(s)`);
  await updateDoc(ref, { gaps: next });
  console.log('    OK — report updated.');
  process.exit(0);
}

main().catch((e) => {
  console.error('fix_fwi_gap crashed:', e);
  process.exit(1);
});
