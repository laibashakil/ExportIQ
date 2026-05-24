import { API_BASE_URL, DEFAULT_REGULATION_IDS } from '../constants/config';

async function req(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  analyze: (factoryId, regulationIds = DEFAULT_REGULATION_IDS) =>
    req('/analyze', {
      method: 'POST',
      body: JSON.stringify({ factory_id: factoryId, regulation_ids: regulationIds }),
    }),
  status: (jobId) => req(`/status/${jobId}`),
  report: (factoryId) => req(`/report/${factoryId}`),
  actions: (factoryId) => req(`/actions/${factoryId}`),
  simulate: (factoryId, actionIds = [], jobId = null) =>
    req(`/simulate/${factoryId}`, {
      method: 'POST',
      body: JSON.stringify({ action_ids: actionIds, job_id: jobId }),
    }),
  documents: (factoryId) => req(`/documents/${factoryId}`),
  generateAuditReady: (factoryId) =>
    req(`/documents/${factoryId}/audit-ready`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
