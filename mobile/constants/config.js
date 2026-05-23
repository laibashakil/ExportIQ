import Constants from 'expo-constants';

const extra = Constants?.expoConfig?.extra ?? {};

// Defaults to the deployed Cloud Run backend so installed APK builds work
// out of the box. Override via app.json -> expo.extra.apiBaseUrl for local
// dev (e.g. "http://<your-lan-ip>:8000" when running uvicorn locally).
export const API_BASE_URL = extra.apiBaseUrl || 'https://exportiq-backend-566147682281.us-central1.run.app';

// NOTE: this file contains real Firebase Web SDK credentials. It is listed
// in .gitignore — do NOT commit it to any public repo.
export const FIREBASE_CONFIG = extra.firebaseConfig || {
  apiKey: 'AIzaSyAjVyxbacLNNLn9o8Qe_Am15Rx4b--FStk',
  authDomain: 'dummy-project-496508.firebaseapp.com',
  projectId: 'dummy-project-496508',
  storageBucket: 'dummy-project-496508.firebasestorage.app',
  messagingSenderId: '566147682281',
  appId: '1:566147682281:web:b37110b3a6a7bb179a0578',
  measurementId: 'G-3MHCEX35JG',
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
    compliance_score: 91,
    risk_level: 'COMPLIANT',
    orders_at_risk_pkr: 8000000,
  },
  // Empty factory used to demo the upload flow. Tapping this card sends the
  // user to the upload screen (no report exists yet → routed before tabs).
  {
    factory_id: 'demo_factory_upload_test',
    factory_name: 'New Factory (Demo Upload)',
    city: 'Faisalabad',
    compliance_score: 0,
    risk_level: 'WARNING',
    orders_at_risk_pkr: 0,
    is_empty: true,
  },
];
