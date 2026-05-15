// Replays the EXACT Firestore query AgentTraceScreen.js issues after Fix 1,
// using the same firebase/firestore package on the same project credentials.
// Confirms (a) no FailedPrecondition / composite-index error is raised and
// (b) the JS sort returns the most recent job for the factory.

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, getDocs, query, where,
  setDoc, doc, serverTimestamp,
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

// Capture console.warn so we can fail the test if any warnings are emitted
// (the user explicitly asked to verify "no console warnings on the phone").
const warnings = [];
const origWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args.map(String).join(' '));
  origWarn(...args);
};

async function main() {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  // Seed three jobs with explicit started_at timestamps so we know what the
  // "most recent" should resolve to.
  console.log('[seed] writing 3 jobs for', FACTORY_ID);
  const t0 = new Date('2026-05-16T05:00:00Z').toISOString();
  const t1 = new Date('2026-05-16T05:30:00Z').toISOString();
  const t2 = new Date('2026-05-16T06:00:00Z').toISOString();
  await setDoc(doc(db, 'jobs', 'verify_job_a'), { factory_id: FACTORY_ID, started_at: t0, status: 'complete', agent_trace: [] });
  await setDoc(doc(db, 'jobs', 'verify_job_b'), { factory_id: FACTORY_ID, started_at: t2, status: 'complete', agent_trace: [] });
  await setDoc(doc(db, 'jobs', 'verify_job_c'), { factory_id: FACTORY_ID, started_at: t1, status: 'complete', agent_trace: [] });

  // === Exact AgentTraceScreen.js post-fix query path ===
  console.log('[query] issuing post-Fix-1 query (where only, no orderBy)');
  let latestJobId = null;
  try {
    const q = query(
      collection(db, 'jobs'),
      where('factory_id', '==', FACTORY_ID),
    );
    const snap = await getDocs(q);
    const jobs = [];
    snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));
    jobs.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
    console.log(`[query] fetched ${jobs.length} jobs for ${FACTORY_ID}`);
    for (const j of jobs.slice(0, 5)) {
      console.log(`   - ${j.id}  started_at=${j.started_at}`);
    }
    if (jobs[0]) latestJobId = jobs[0].id;
  } catch (e) {
    console.warn('jobs query failed', e);
  }

  console.log(`[result] latestJobId resolved to: ${latestJobId}`);
  const expectedMostRecent = 'verify_job_b';  // t2 is newest

  // Pass criteria:
  //   1. Zero console.warn calls (the original failure mode).
  //   2. Sort actually picks the newest job (semantic correctness).
  const pass = warnings.length === 0 && latestJobId === expectedMostRecent;
  console.log('\n--- RESULTS ---');
  console.log(`  console.warn calls           : ${warnings.length}`);
  if (warnings.length) for (const w of warnings) console.log('    >', w);
  console.log(`  latestJobId === ${expectedMostRecent}? : ${latestJobId === expectedMostRecent}`);
  console.log(`\nAGENTTRACE FIX-1 VERIFICATION: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('script crashed:', e);
  process.exit(1);
});
