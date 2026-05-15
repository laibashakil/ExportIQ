// End-to-end check of the mobile HomeScreen live-score animation path:
//
//   backend (Python admin SDK)           mobile (JS SDK)
//   ─────────────────────────            ────────────────
//   update_compliance_score()  →  /factories/{id}  →  onSnapshot(...)  →  HomeScreen score
//
// This script subscribes via the JS SDK (exactly what HomeScreen does), then
// asks the backend's Python `update_compliance_score` to fire several updates
// on a short cadence. PASS = the JS listener observes each score change.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

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
const SCORES = [43, 61, 71, 78, 85];

function runPythonWrites() {
  // One-liner that uses backend/tools/firestore_client.update_compliance_score
  // — the *exact* function execution_agent.run() calls per simulated action.
  const py = `
import sys, time
sys.path.insert(0, r"${REPO_ROOT.replace(/\\/g, '/')}/backend")
from tools.firestore_client import update_compliance_score
scores = ${JSON.stringify(SCORES)}
for s in scores:
    level = "CRITICAL" if s < 60 else ("WARNING" if s < 85 else "COMPLIANT")
    print(f"[backend] update_compliance_score(${FACTORY_ID}, score={'{'}s{'}'}, risk={'{'}level{'}'})", flush=True)
    update_compliance_score("${FACTORY_ID}", s, level, max(0, 340_000_000 - s * 4_000_000))
    time.sleep(0.5)
print("[backend] done", flush=True)
`;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('python', ['-c', py], {
      cwd: resolve(REPO_ROOT, 'backend'),
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error(`python exited ${code}`))
    );
    child.on('error', rejectPromise);
  });
}

async function main() {
  console.log(`[js] subscribing to /factories/${FACTORY_ID} via Firebase Web SDK`);
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const observedScores = [];
  const unsub = onSnapshot(
    doc(db, 'factories', FACTORY_ID),
    (snap) => {
      const d = snap.exists() ? snap.data() : null;
      const score = d?.compliance_score;
      if (typeof score === 'number') {
        observedScores.push(score);
        console.log(`  [js   listener]  score=${score}  risk=${d?.risk_level}`);
      }
    },
    (err) => {
      console.error('  [js   listener ERROR]', err.message || err);
      process.exit(1);
    }
  );

  // small grace period so initial snapshot lands before backend writes start
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`[backend] writing ${SCORES.length} score updates via Python admin SDK …`);
  await runPythonWrites();

  // Drain a couple more seconds in case the listener is still catching up
  await new Promise((r) => setTimeout(r, 2500));
  unsub();

  // Verify each backend-written score was observed by the JS listener
  const distinct = [...new Set(observedScores)];
  const writtenObserved = SCORES.filter((s) => distinct.includes(s));
  console.log('\n--- RESULTS ---');
  console.log('  scores written by backend  :', SCORES);
  console.log('  scores observed by JS SDK  :', distinct);
  console.log('  matched                    :', writtenObserved);

  const pass = writtenObserved.length === SCORES.length;
  console.log(`\nLIVE SCORE UPDATE PATH: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('script crashed:', e);
  process.exit(1);
});
