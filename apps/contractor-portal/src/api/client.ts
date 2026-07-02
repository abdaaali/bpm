import axios from 'axios';

const api = axios.create({ baseURL: '' });

export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/ext/auth/login', { email, password }),
  getProfile: () => api.get('/api/ext/auth/profile'),
  logout: () => api.post('/api/ext/auth/logout'),
};

export const workOrderApi = {
  list: (params?: any) => api.get('/api/ext/work-orders', { params }),
  get: (id: string) => api.get(`/api/ext/work-orders/${id}`),
  accept: (id: string) => api.post(`/api/ext/work-orders/${id}/accept`),
  reject: (id: string, reason: string) => api.post(`/api/ext/work-orders/${id}/reject`, { reason }),
  submitProgress: (id: string, data: any) => api.post(`/api/ext/work-orders/${id}/progress`, data),
  complete: (id: string, data: any) => api.post(`/api/ext/work-orders/${id}/complete`, data),
  requestClarification: (id: string, message: string) => api.post(`/api/ext/work-orders/${id}/clarification`, { message }),
  requestReschedule: (id: string, data: any) => api.post(`/api/ext/work-orders/${id}/reschedule`, data),
};

export const dashboardApi = {
  getStats: () => api.get('/api/ext/dashboard/stats'),
};

export const companyApi = {
  getMyCompany: () => api.get('/api/ext/company/me'),
  getTeam: () => api.get('/api/ext/company/team'),
  getStats: () => api.get('/api/ext/company/stats'),
};

export const attachmentApi = {
  upload: (assignmentId: string, formData: FormData, attachmentType: string) =>
    api.post(`/api/ext/attachments/${assignmentId}?attachmentType=${attachmentType}&visibilityScope=shared`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  list: (assignmentId: string) => api.get(`/api/ext/attachments/${assignmentId}`),
  getDownloadUrl: (id: string) => `/api/ext/attachments/download/${id}`,
};
