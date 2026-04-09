const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'API request failed');
  }

  return res.json();
}

export const api = {
  // Dashboard
  getDashboardMetrics: () => request('/dashboard/metrics'),
  getDashboardAgents: () => request('/dashboard/agents'),
  getAttentionFeed: () => request('/dashboard/attention'),

  // Agents
  getAgents: () => request('/agents'),
  getAgent: (id) => request(`/agents/${id}`),
  updateAgent: (id, data) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  testSmtp: (id) => request(`/agents/${id}/test-smtp`, { method: 'POST' }),
  testImap: (id) => request(`/agents/${id}/test-imap`, { method: 'POST' }),
  getAgentSent: (id) => request(`/agents/${id}/sent`),

  // Prospects
  getProspects: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/prospects?${query}`);
  },
  getProspect: (id) => request(`/prospects/${id}`),
  updateProspectStatus: (id, status) => request(`/prospects/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  getScrubQueue: (agentId) => request(`/prospects/scrub/${agentId}`),
  bulkApproveScrub: (ids) => request('/prospects/scrub/approve', { method: 'POST', body: JSON.stringify({ prospect_ids: ids }) }),
  bulkRejectScrub: (ids, reason) => request('/prospects/scrub/reject', { method: 'POST', body: JSON.stringify({ prospect_ids: ids, reason }) }),

  // Sequences
  getSequences: () => request('/sequences'),
  getSequence: (id) => request(`/sequences/${id}`),
  createSequence: (data) => request('/sequences', { method: 'POST', body: JSON.stringify(data) }),
  updateSequence: (id, data) => request(`/sequences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addStep: (seqId, data) => request(`/sequences/${seqId}/steps`, { method: 'POST', body: JSON.stringify(data) }),
  updateStep: (stepId, data) => request(`/sequences/steps/${stepId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Inbox
  getInbox: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/inbox?${query}`);
  },
  getThread: (id) => request(`/inbox/${id}`),
  actionInbox: (id, action) => request(`/inbox/${id}/action`, { method: 'PUT', body: JSON.stringify(action) }),

  // Pipeline
  getPipeline: () => request('/pipeline'),
  getPipelineStats: () => request('/pipeline/stats'),
  moveProspect: (id, data) => request(`/pipeline/${id}/move`, { method: 'PUT', body: JSON.stringify(data) }),

  // Apollo
  searchApollo: (query) => request('/apollo/search', { method: 'POST', body: JSON.stringify(query) }),
  importFromApollo: (data) => request('/apollo/import', { method: 'POST', body: JSON.stringify(data) }),
  getApolloPulls: () => request('/apollo/pulls'),

  // Inbox AI
  regenerateDraft: (id) => request(`/inbox/${id}/regenerate-draft`, { method: 'POST' }),

  // AI
  rewriteStep: (data) => request('/ai/rewrite', { method: 'POST', body: JSON.stringify(data) }),
  analyzeSentiment: (text) => request('/ai/sentiment', { method: 'POST', body: JSON.stringify({ text }) }),

  // Analytics
  getAnalyticsFunnel: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/analytics/funnel?${q}`); },
  getAnalyticsAgents: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/analytics/agents?${q}`); },
  getAnalyticsSequences: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/analytics/sequences?${q}`); },
  getAnalyticsTrends: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/analytics/trends?${q}`); },

  // A/B Testing
  getABTests: () => request('/ab'),
  createABTest: (data) => request('/ab', { method: 'POST', body: JSON.stringify(data) }),
  promoteVariant: (testId, variantId) => request(`/ab/${testId}/promote`, { method: 'POST', body: JSON.stringify({ variant_id: variantId }) }),

  // Tasks
  getTasks: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/tasks?${q}`); },
  getTaskCounts: () => request('/tasks/counts'),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: 'PUT' }),
  skipTask: (id) => request(`/tasks/${id}/skip`, { method: 'PUT' }),

  // Domain Health
  getDomainHealth: (domain) => request(`/ai/domain-health?domain=${domain || '1cloudnow.com'}`),
  checkDomainHealth: (domain) => request('/ai/domain-health/check', { method: 'POST', body: JSON.stringify({ domain: domain || '1cloudnow.com' }) }),

  // AI Sequence Generation
  generateSequence: (data) => request('/ai/generate-sequence', { method: 'POST', body: JSON.stringify(data) }),

  // Rotation
  getRotationRecommendation: () => request('/ai/rotation-recommendation'),
  rotateProspects: (data) => request('/ai/rotate', { method: 'POST', body: JSON.stringify(data) }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};
