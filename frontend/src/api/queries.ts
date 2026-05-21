import { getData, postData, patchData, deleteData } from './client';
import type {
  AuditLog,
  Overview,
  Paginated,
  Server,
  Subdomain,
  SubdomainRemoveSummary,
  User,
} from '@/types';

// ── auth ─────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  postData<{ accessToken: string; expiresIn: number; user: User }>(
    '/auth/login',
    { email, password },
  );
export const logout = () => postData<void>('/auth/logout');
export const me = () => getData<User>('/auth/me');

// ── users ────────────────────────────────────────────────────────────────
export const listUsers = (params: { page?: number; pageSize?: number; q?: string }) =>
  getData<Paginated<User>>('/users', params);
export const createUser = (body: { email: string; password: string; name?: string; role?: 'ADMIN' | 'USER' }) =>
  postData<User>('/users', body);
export const updateUser = (id: string, body: Partial<User & { password?: string }>) =>
  patchData<User>(`/users/${id}`, body);
export const deleteUser = (id: string) => deleteData<void>(`/users/${id}`);

// ── servers ──────────────────────────────────────────────────────────────
export const listServers = (params: { page?: number; pageSize?: number; q?: string }) =>
  getData<Paginated<Server>>('/servers', params);
export const getServer = (id: string) => getData<Server>(`/servers/${id}`);
export const createServer = (body: unknown) => postData<Server>('/servers', body);
export const updateServer = (id: string, body: unknown) => patchData<Server>(`/servers/${id}`, body);
export const deleteServer = (id: string) => deleteData<void>(`/servers/${id}`);
export const testServer = (id: string) =>
  postData<{ ok: boolean; uname?: string; error?: string }>(`/servers/${id}/test`);

// ── subdomains ───────────────────────────────────────────────────────────
export const listSubdomains = (params: {
  page?: number;
  pageSize?: number;
  q?: string;
  serverId?: string;
  status?: string;
}) => getData<Paginated<Subdomain>>('/subdomains', params);
export const getSubdomain = (id: string) => getData<Subdomain>(`/subdomains/${id}`);
export const createSubdomain = (body: unknown) => postData<Subdomain>('/subdomains', body);
export const updateSubdomain = (id: string, body: unknown) =>
  patchData<Subdomain>(`/subdomains/${id}`, body);
export const deleteSubdomain = (id: string) =>
  deleteData<SubdomainRemoveSummary>(`/subdomains/${id}`);
export const enableSubdomain = (id: string) => postData<Subdomain>(`/subdomains/${id}/enable`);
export const disableSubdomain = (id: string) => postData<Subdomain>(`/subdomains/${id}/disable`);
export const renewSubdomainSsl = (id: string) => postData<Subdomain>(`/subdomains/${id}/renew-ssl`);
export const previewSubdomainConfig = (id: string) =>
  getData<{ config: string }>(`/subdomains/${id}/config`);
export const probeSubdomain = (id: string) =>
  getData<{ reachable: boolean; httpStatus?: number; responseMs?: number; error?: string }>(
    `/monitoring/subdomains/${id}/probe`,
  );

// ── monitoring & audit ───────────────────────────────────────────────────
export const overview = () => getData<Overview>('/monitoring/overview');
export const serverStatus = (id: string) =>
  getData<{ running: boolean; version?: string; uptimeSeconds?: number; workerCount?: number }>(
    `/monitoring/servers/${id}/status`,
  );
export const listAudit = (params: { page?: number; pageSize?: number; q?: string; action?: string }) =>
  getData<Paginated<AuditLog>>('/audit', params);
