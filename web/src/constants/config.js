// Backend + Firebase config for the web app. Mirrors mobile/constants/config.js.
export const API_BASE_URL = 'https://exportiq-backend-gd7cex3ugq-uc.a.run.app';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCP9EzOhT7k3cuT5NvoQXovnKnzRmGkzm0',
  authDomain: 'exportiq-496416.firebaseapp.com',
  projectId: 'exportiq-496416',
  storageBucket: 'exportiq-496416.firebasestorage.app',
  messagingSenderId: '834278774758',
  appId: '1:834278774758:web:b02dda054471bdb4aa2827',
  measurementId: 'G-VQMDM0830L',
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
