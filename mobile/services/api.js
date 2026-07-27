// Thin fetch wrapper around the FastAPI backend.
import { API_BASE_URL } from '../constants/config';

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

/**
 * Multipart POST /upload for an audit PDF. Uses FormData so RN handles the
 * file URI -> blob conversion natively.
 */
async function uploadFile({ uri, name, mimeType, factoryId }) {
  const form = new FormData();
  form.append('file', {
    uri,
    name: name || 'audit.pdf',
    type: mimeType || 'application/pdf',
  });
  form.append('kind', 'factory_audit');
  if (factoryId) form.append('factory_id', factoryId);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    // Note: do NOT set Content-Type — RN/fetch will set the multipart
    // boundary automatically.
    body: form,
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`Upload failed (HTTP ${res.status})`);
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  upload: uploadFile,
  analyze: (factoryId, regulationIds = ['eu_csddd', 'uk_modern_slavery', 'sa8000', 'eu_reach', 'gsplus']) =>
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
  exportSummaryUrl: (factoryIds) => {
    // Returned as a URL string so the caller can hand it to expo-sharing
    // or Linking.openURL directly.
    const q = factoryIds && factoryIds.length
      ? `?factory_ids=${encodeURIComponent(factoryIds.join(','))}`
      : '';
    return `${API_BASE_URL}/export-summary${q}`;
  },
  failureTest: (jobId, agent, failureType) =>
    req(`/failure-test/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ agent, failure_type: failureType }),
    }),
};
