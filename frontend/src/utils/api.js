import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  updateEmail: (data) => api.put('/auth/email', data),
  updatePassword: (data) => api.put('/auth/password', data),
  updatePreferences: (data) => api.put('/auth/preferences', data),
};

// Books API
export const booksAPI = {
  getAll: (params) => api.get('/books', { params }),
  getById: (id) => api.get(`/books/${id}`),
  add: (data) => api.post('/books', data),
  update: (id, data) => api.put(`/books/${id}`, data),
  remove: (id) => api.delete(`/books/${id}`),
  search: (params) => api.get('/books/search', { params }),
  getDuplicates: () => api.get('/books/duplicates'),
};

// Shelves API
export const shelvesAPI = {
  getAll: () => api.get('/shelves'),
  getById: (id) => api.get(`/shelves/${id}`),
  create: (data) => api.post('/shelves', data),
  update: (id, data) => api.put(`/shelves/${id}`, data),
  remove: (id) => api.delete(`/shelves/${id}`),
  reorder: (data) => api.post('/shelves/reorder', data),
};

// Readings API
export const readingsAPI = {
  getByBookId: (bookId) => api.get(`/readings/${bookId}`),
  getByStatus: (status) => api.get(`/readings/status/${status}`),
  getStats: () => api.get('/readings/stats'),
  update: (bookId, data) => api.put(`/readings/${bookId}`, data),
  remove: (bookId) => api.delete(`/readings/${bookId}`),
};

// Scan API
export const scanAPI = {
  scanShelf: (formData) => api.post('/scan/shelf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  searchExternal: (params) => api.get('/scan/search', { params }),
  getHistory: () => api.get('/scan/history'),
  batchAdd: (data) => api.post('/scan/batch', data),
};

// Recommendations API
export const recommendationsAPI = {
  get: (params) => api.get('/recommendations', { params }),
  getInsights: () => api.get('/recommendations/insights'),
  getOrganization: (params) => api.get('/recommendations/organize', { params }),
  applyOrganization: (data) => api.post('/recommendations/organize/apply', data),
};

export default api;
