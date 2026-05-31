// Backend + Firebase config for the web app. Mirrors mobile/constants/config.js.
export const API_BASE_URL = 'https://exportiq-backend-495022768388.us-central1.run.app';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA7IglTBHOGHHtAlsR9tPW2SrAIisps8Lw',
  authDomain: 'gen-lang-client-0067611351.firebaseapp.com',
  projectId: 'gen-lang-client-0067611351',
  storageBucket: 'gen-lang-client-0067611351.firebasestorage.app',
  messagingSenderId: '495022768388',
  appId: '1:495022768388:web:70ca122ddde84b5cf51051',
  measurementId: 'G-EB3828VD34',
};

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

export const DEFAULT_REGULATION_IDS = [
  'eu_csddd',
  'uk_modern_slavery',
  'sa8000',
  'eu_reach',
  'gsplus',
];
