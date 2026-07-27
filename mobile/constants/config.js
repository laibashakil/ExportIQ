import Constants from 'expo-constants';

const extra = Constants?.expoConfig?.extra ?? {};

// Defaults to the deployed Cloud Run backend so installed APK builds work
// out of the box. Override via app.json -> expo.extra.apiBaseUrl for local
// dev (e.g. "http://<your-lan-ip>:8000" when running uvicorn locally).
export const API_BASE_URL = extra.apiBaseUrl || 'https://exportiq-backend-495022768388.us-central1.run.app';

// NOTE: this file contains real Firebase Web SDK credentials. It is listed
// in .gitignore — do NOT commit it to any public repo.
export const FIREBASE_CONFIG = extra.firebaseConfig || {
  apiKey: 'AIzaSyA7IglTBHOGHHtAlsR9tPW2SrAIisps8Lw',
  authDomain: 'gen-lang-client-0067611351.firebaseapp.com',
  projectId: 'gen-lang-client-0067611351',
  storageBucket: 'gen-lang-client-0067611351.firebasestorage.app',
  messagingSenderId: '495022768388',
  appId: '1:495022768388:web:70ca122ddde84b5cf51051',
  measurementId: 'G-EB3828VD34',
};

// Demo factories — used to populate the HomeScreen list on first launch
// before /analyze has been called.
export const DEMO_FACTORIES = [
  {
    factory_id: 'fwi_fsd_001',
    factory_name: 'Faisal Weave Industries',
    city: 'Faisalabad',
    compliance_score: 43,
    risk_level: 'CRITICAL',
    orders_at_risk_pkr: 340000000,
  },
  {
    factory_id: 'cfw_lhe_002',
    factory_name: 'Chenab Fabric Works',
    city: 'Lahore',
    compliance_score: 78,
    risk_level: 'WARNING',
    orders_at_risk_pkr: 45000000,
  },
  {
    factory_id: 'rgl_khi_003',
    factory_name: 'Ravi Garments Ltd',
    city: 'Karachi',
    compliance_score: 95,
    risk_level: 'COMPLIANT',
    orders_at_risk_pkr: 8000000,
  },
];

// Factory id used by the permanent "Add New Factory" card's upload flow.
// It is intentionally NOT part of DEMO_FACTORIES — the add affordance is a
// static UI element, never a data row. Points at the demo-upload factory
// (Al-Madina Sportswear) so uploading during the pitch analyzes ams_skl_004
// and surfaces its pinned score-38 result. Switch to 'sgd_tex_005' to drive
// the backup factory instead.
export const NEW_FACTORY_UPLOAD_ID = 'ams_skl_004';
