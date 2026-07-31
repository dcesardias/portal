import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getSimulateUserId } from './simulation';

export const api = axios.create({
  // Proxied pelo Portal: /aacdinveste/api/v1/* → NestJS :3000/api/v1/*
  baseURL: '/aacdinveste/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Simulação de usuário (admin só-leitura): o backend só honra este header
  // se o usuário real do token for ADMIN.
  const simulateUserId = getSimulateUserId();
  if (simulateUserId) {
    config.headers['X-Simulate-User'] = simulateUserId;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/auth/refresh') ||
      original.url?.includes('/auth/login')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
      const newToken = data.accessToken;
      sessionStorage.setItem('access_token', newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      processQueue(null, newToken);
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError, null);
      sessionStorage.removeItem('access_token');
      // Full-load para a bridge de SSO do Portal (re-autentica via sessão do portal)
      window.location.href = '/aacdinveste/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
