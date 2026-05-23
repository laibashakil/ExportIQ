// Backend + Firebase config for the web app. Mirrors mobile/constants/config.js.
export const API_BASE_URL = 'https://exportiq-backend-566147682281.us-central1.run.app';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAjVyxbacLNNLn9o8Qe_Am15Rx4b--FStk',
  authDomain: 'dummy-project-496508.firebaseapp.com',
  projectId: 'dummy-project-496508',
  storageBucket: 'dummy-project-496508.firebasestorage.app',
  messagingSenderId: '566147682281',
  appId: '1:566147682281:web:b37110b3a6a7bb179a0578',
  measurementId: 'G-3MHCEX35JG',
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
    compliance_score: 91,
    risk_level: 'COMPLIANT',
    orders_at_risk_pkr: 8000000,
  },
];

export const DEFAULT_REGULATION_IDS = [
  'eu_cbam',
  'uk_modern_slavery',
  'eu_supply_chain_directive',
];
