import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

import { useAuthStore } from '@/stores/auth.store';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInflight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const { data } = await axios.post(
          `${baseURL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const token = data?.data?.accessToken ?? null;
        if (token) useAuthStore.getState().setAccessToken(token);
        return token;
      } catch {
        useAuthStore.getState().clear();
        return null;
      } finally {
        // small microtask delay so concurrent requests share the same promise
        setTimeout(() => (refreshInflight = null), 0);
      }
    })();
  }
  return refreshInflight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string | string[] }>) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const isAuthEndpoint = (original?.url ?? '').includes('/auth/');

    if (status === 401 && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return api(original);
      }
    }

    const msg = error.response?.data?.message;
    const text = Array.isArray(msg) ? msg.join(', ') : (msg ?? error.message);
    if (status && status >= 400 && !isAuthEndpoint) {
      toast.error(text || 'Something went wrong');
    }
    return Promise.reject(error);
  },
);

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export async function getData<T>(url: string, params?: object): Promise<T> {
  const res = await api.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
}

export async function postData<T, B = unknown>(url: string, body?: B): Promise<T> {
  const res = await api.post<ApiEnvelope<T>>(url, body);
  return res.data.data;
}

export async function patchData<T, B = unknown>(url: string, body?: B): Promise<T> {
  const res = await api.patch<ApiEnvelope<T>>(url, body);
  return res.data.data;
}

export async function deleteData<T = void>(url: string): Promise<T> {
  const res = await api.delete<ApiEnvelope<T>>(url);
  return res.data.data;
}
