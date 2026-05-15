// Loads the latest trace entries from Firestore for the 3 demo factories and
// runs every entry through formatTraceEntry. Asserts:
//   - no formatted output contains a raw JSON brace `{` or `}`
//   - no formatted output is the literal string "[object Object]"
//   - every formatted output is a non-empty string
// Also prints a sample of formatted lines per agent so a human can eyeball the
// readability.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { formatTraceEntry } from '../utils/traceFormatter.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCP9EzOhT7k3cuT5NvoQXovnKnzRmGkzm0',
  authDomain: 'exportiq-496416.firebaseapp.com',
  projectId: 'exportiq-496416',
  storageBucket: 'exportiq-496416.firebasestorage.app',
  messagingSenderId: '834278774758',
  appId: '1:834278774758:web:b02dda054471bdb4aa2827',
};

async function main() {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  let totalEntries = 0;
  let totalLeaks = 0;
  const samplesByAgent = {};

  for (const fid of ['fwi_fsd_001', 'cfw_lhe_002', 'rgl_khi_003']) {
    const snap = await getDocs(
      query(collection(db, 'jobs'), where('factory_id', '==', fid)),
    );
    const jobs = [];
    snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));
    jobs.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
    const latest = jobs[0];
    if (!latest) {
      console.log(`!! ${fid}: no jobs found`);
      continue;
    }
    const trace = latest.agent_trace || [];
    console.log(`\n=== ${fid} (job ${latest.id}, status=${latest.status}, ${trace.length} trace entries) ===`);

    for (const entry of trace) {
      totalEntries++;
      const out = formatTraceEntry(entry);
      // Smoke contract checks
      const leaks =
        typeof out !== 'string' ||
        out.length === 0 ||
        out.includes('{') ||
        out.includes('}') ||
        out.includes('[object Object]');
      if (leaks) {
        totalLeaks++;
        console.log(`!! LEAK [${entry.agent}/${entry.step}] -> ${JSON.stringify(out)}`);
      }
      samplesByAgent[entry.agent] = samplesByAgent[entry.agent] || [];
      if (samplesByAgent[entry.agent].length < 3) {
        samplesByAgent[entry.agent].push({ step: entry.step, formatted: out });
      }
    }
  }

  console.log('\n=== SAMPLES PER AGENT ===');
  for (const [agent, samples] of Object.entries(samplesByAgent)) {
    console.log(`\n[${agent}]`);
    for (const s of samples) {
      console.log(`  ${s.step.padEnd(28)}  →  ${s.formatted}`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(`  total trace entries        : ${totalEntries}`);
  console.log(`  JSON/object leaks          : ${totalLeaks}`);
  console.log(`\nTRACE FORMATTER: ${totalLeaks === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(totalLeaks === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('crash:', e);
  process.exit(1);
});
