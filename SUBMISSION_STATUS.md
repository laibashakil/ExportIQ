## ⚠️ Deployment Note

Original project exportiq-496416 was suspended on May 20, 2026
due to a billing account switch during submission day.
Redeployed to dummy-project-496508 on May 21, 2026.

On 2026-05-23 the stack was briefly re-pointed to an interim project
(`dummy-project-496508`), then finally migrated to the project it runs on
today: **`gen-lang-client-0067611351`**.

Current live deployment (as of 2026-05-31):

- **GCP / Firebase project:** `gen-lang-client-0067611351`
- **Cloud Run backend:** `https://exportiq-backend-495022768388.us-central1.run.app`
  (env: `FIREBASE_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`,
  `FIREBASE_STORAGE_BUCKET` all reference `gen-lang-client-0067611351`).
- **Web app:** `https://gen-lang-client-0067611351.web.app`
  (Firebase Web SDK config in `web/src/constants/config.js`).
- **Mobile app:** Firebase config in `mobile/constants/config.js` +
  `mobile/app.json` `extra.firebaseConfig` point to the same project.
- `.firebaserc` default project = `gen-lang-client-0067611351`.

All code, agents, and functionality are identical across the moves.
Live URLs are reflected in the README.md live-links section.

Known operational note: the deployed backend has Vertex AI credentials but
no `GEMINI_API_KEY`, so if a Vertex call times out and the circuit breaker
trips, the affected agents fall back to deterministic stubs (the pipeline
never breaks). Set `GEMINI_API_KEY` on Cloud Run to enable the AI Studio
fallback path for consistently live Gemini output.
