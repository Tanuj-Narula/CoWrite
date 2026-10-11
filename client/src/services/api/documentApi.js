import { apiClient } from './client.js';

export const documentApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiClient.get(`/documents${query ? `?${query}` : ''}`);
  },
  get: (id) => apiClient.get(`/documents/${id}`),
  create: (payload) => apiClient.post('/documents', payload),
  update: (id, payload) => apiClient.patch(`/documents/${id}`, payload),
  rename: (id, title) => apiClient.patch(`/documents/${id}/rename`, { title }),
  delete: (id) => apiClient.delete(`/documents/${id}`),
  getVersions: (id) => apiClient.get(`/documents/${id}/versions`),
  restoreVersion: (id, versionId) =>
    apiClient.post(`/documents/${id}/versions/${versionId}/restore`),
  addCollaborator: (id, payload) =>
    apiClient.post(`/documents/${id}/collaborators`, payload),
  removeCollaborator: (id, collaboratorId) =>
    apiClient.delete(`/documents/${id}/collaborators/${collaboratorId}`),
  updateAccess: (id, publicAccess) =>
    apiClient.patch(`/documents/${id}/access`, { publicAccess }),
};

export default documentApi;
