## ⚠️ Deployment Note

Original project exportiq-496416 was suspended on May 20, 2026
due to a billing account switch during submission day.
Redeployed to dummy-project-496508 on May 21, 2026.

On 2026-05-23 the entire stack was re-pointed to the new project:

- Cloud Run backend env (`FIREBASE_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`,
  `FIREBASE_STORAGE_BUCKET`) now reference `dummy-project-496508`.
- Web app Firebase Web SDK config (`web/src/constants/config.js`)
  rewired to `dummy-project-496508` (apiKey, authDomain, appId,
  messagingSenderId, measurementId all regenerated).
- Mobile app Firebase config (`mobile/constants/config.js`,
  `mobile/app.json` `extra.firebaseConfig`) rewired to the same
  new web app. Version bumped to `1.0.1` / `versionCode: 2`.
- `.firebaserc` default project updated.

All code, agents, and functionality are identical.
New URLs are reflected in README.md live links section.
