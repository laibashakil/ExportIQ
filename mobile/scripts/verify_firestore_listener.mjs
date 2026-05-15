// Verifies the EXACT mobile listener path used by HomeScreen:
//   subscribeFactory(factoryId, cb) → onSnapshot(doc('factories', id), cb)
//
// Flow:
//   1. Initialise Firebase Web SDK with mobile/constants/config.js values.
//   2. Attach an onSnapshot listener on /factories/fwi_fsd_001.
//   3. Mutate that doc twice from the same SDK (simulating what the
//      execution_agent's update_compliance_score does on the backend).
//   4. Assert the listener fires for each update.
//
// Pass = listener got >= 2 callbacks with the score values we wrote.
// Run from mobile/:  node scripts/verify_firestore_listener.mjs

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

// Inline copy of FIREBASE_CONFIG — same values as constants/config.js.
// Done this way because constants/config.js depends on expo-constants which
// has no Node import shim.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCP9EzOhT7k3cuT5NvoQXovnKnzRmGkzm0',
  authDomain: 'exportiq-496416.firebaseapp.com',
  projectId: 'exportiq-496416',
  storageBucket: 'exportiq-496416.firebasestorage.app',
  messagingSenderId: '834278774758',
  appId: '1:834278774758:web:b02dda054471bdb4aa2827',
  measurementId: 'G-VQMDM0830L',
};

function ensureApp() {
  return getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
}

async function main() {
  const factoryId = 'fwi_fsd_001';
  console.log(`[1] initializing Firebase Web SDK (project=${FIREBASE_CONFIG.projectId})`);
  const app = ensureApp();
  const db = getFirestore(app);
  console.log(`    OK — app name=${app.name}`);

  console.log(`[2] subscribing to /factories/${factoryId}`);
  const ref = doc(db, 'factories', factoryId);
  const received = [];
  const unsub = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      received.push(data);
      const score = data?.compliance_score;
      const risk = data?.risk_level;
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`    [snapshot #${received.length} @ ${ts}] score=${score} risk=${risk}`);
    },
    (err) => {
      console.error('    [snapshot error]', err.code || err.message || err);
      process.exit(1);
    }
  );

  // wait for the initial snapshot
  console.log('[3] waiting for initial snapshot…');
  await new Promise((r) => setTimeout(r, 3000));
  const initialCount = received.length;
  console.log(`    initial callbacks: ${initialCount}`);

  // simulate two backend-side score updates back-to-back
  console.log('[4] writing two updates to /factories/' + factoryId + ' (simulating execution_agent.update_compliance_score)');
  await setDoc(
    ref,
    {
      factory_id: factoryId,
      compliance_score: 61,
      risk_level: 'CRITICAL',
      orders_at_risk_pkr: 164_000_000,
      updated_at: serverTimestamp(),
      _verification_step: 1,
    },
    { merge: true }
  );
  console.log('    wrote update #1 (score=61)');
  await new Promise((r) => setTimeout(r, 1500));

  await setDoc(
    ref,
    {
      compliance_score: 71,
      risk_level: 'WARNING',
      orders_at_risk_pkr: 60_000_000,
      updated_at: serverTimestamp(),
      _verification_step: 2,
    },
    { merge: true }
  );
  console.log('    wrote update #2 (score=71)');
  await new Promise((r) => setTimeout(r, 1500));

  unsub();
  console.log('[5] unsubscribed.');

  // Assertions
  const writtenCallbacks = received.length - initialCount;
  console.log('\n--- RESULTS ---');
  console.log(`  total callbacks fired   : ${received.length}`);
  console.log(`  callbacks after writes  : ${writtenCallbacks}`);
  const score61 = received.find((d) => d?._verification_step === 1)?.compliance_score;
  const score71 = received.find((d) => d?._verification_step === 2)?.compliance_score;
  console.log(`  saw score=61 update     : ${score61 === 61}`);
  console.log(`  saw score=71 update     : ${score71 === 71}`);

  const ok = writtenCallbacks >= 2 && score61 === 61 && score71 === 71;
  console.log(`\nLISTENER VERIFICATION: ${ok ? 'PASS' : 'FAIL'}`);

  // Force exit (gRPC keeps the loop alive otherwise)
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('script crashed:', e);
  process.exit(1);
});
