#!/usr/bin/env node
/**
 * Deploy the Firestore composite indexes declared in firestore.indexes.json.
 *
 * Background:
 *   AgentTraceScreen used to query
 *     where('factory_id','==', id).orderBy('started_at','desc').limit(1)
 *   which requires a composite index on (factory_id ASC, started_at DESC).
 *   The screen now sorts in JS so the index isn't strictly required, but
 *   deploying the index restores the more efficient server-side query path.
 *
 * Usage:
 *   1. One-time tooling install (if you don't have it yet):
 *        npm install -g firebase-tools
 *
 *   2. One-time login:
 *        firebase login
 *
 *   3. Deploy:
 *        node mobile/scripts/create_firestore_indexes.js
 *
 *      …which is just a friendly wrapper around:
 *        firebase deploy --only firestore:indexes --project exportiq-496416
 *
 * Files read by the CLI (must exist at the repo root):
 *   - firebase.json         tells the CLI where the indexes file lives
 *   - .firebaserc           pins the default project to exportiq-496416
 *   - firestore.indexes.json the actual index definitions
 *
 * Idempotent: re-running this script on an already-deployed project is a no-op.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ID = 'exportiq-496416';

function requireFile(p, hint) {
  const full = path.join(REPO_ROOT, p);
  if (!fs.existsSync(full)) {
    console.error(`[create_firestore_indexes] missing ${p} — ${hint}`);
    process.exit(1);
  }
}

function requireCli() {
  // `firebase` resolves through PATH; `--version` is a cheap sanity check
  const r = spawnSync('firebase', ['--version'], { stdio: 'pipe', shell: true });
  if (r.status !== 0) {
    console.error('[create_firestore_indexes] firebase-tools not found on PATH.');
    console.error('  install: npm install -g firebase-tools');
    console.error('  then:    firebase login');
    process.exit(1);
  }
  console.log(`[create_firestore_indexes] firebase-tools ${String(r.stdout).trim()} detected`);
}

function showIndexes() {
  const p = path.join(REPO_ROOT, 'firestore.indexes.json');
  const conf = JSON.parse(fs.readFileSync(p, 'utf-8'));
  console.log('[create_firestore_indexes] indexes that will be deployed:');
  for (const i of conf.indexes || []) {
    const fields = i.fields
      .map((f) => `${f.fieldPath}:${(f.order || f.arrayConfig || '').toLowerCase()}`)
      .join(', ');
    console.log(`  - ${i.collectionGroup} [${i.queryScope}] {${fields}}`);
  }
}

function deploy() {
  console.log(`[create_firestore_indexes] running: firebase deploy --only firestore:indexes --project ${PROJECT_ID}`);
  const r = spawnSync(
    'firebase',
    ['deploy', '--only', 'firestore:indexes', '--project', PROJECT_ID],
    { cwd: REPO_ROOT, stdio: 'inherit', shell: true },
  );
  if (r.status !== 0) {
    console.error('[create_firestore_indexes] deploy FAILED. If this is the first run, try `firebase login` first.');
    process.exit(r.status || 1);
  }
  console.log('[create_firestore_indexes] indexes deployed.');
  console.log('[create_firestore_indexes] NOTE: composite-index builds can take 1-5 minutes to complete server-side.');
  console.log('  Watch progress: https://console.firebase.google.com/project/' + PROJECT_ID + '/firestore/indexes');
}

function main() {
  requireFile('firebase.json', 'CLI needs firebase.json at the repo root');
  requireFile('.firebaserc', 'CLI needs .firebaserc to pin the project id');
  requireFile('firestore.indexes.json', 'index definitions live here');
  requireCli();
  showIndexes();
  deploy();
}

main();
