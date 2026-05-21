import { io, Socket } from 'socket.io-client';

import { deleteData, getData, postData } from './client';
import { useAuthStore } from '@/stores/auth.store';

export interface CuratedPackage {
  id: string;
  label: string;
  description: string;
  packages: string[];
}

export interface InstalledPackage {
  name: string;
  version: string;
}

export type Protocol = 'tcp' | 'udp';
export type FirewallAction = 'allow' | 'deny';
export type FirewallBackend = 'ufw' | 'firewalld' | 'none';

export interface FirewallRule {
  id: string;
  port?: number;
  portRange?: { from: number; to: number };
  protocol: Protocol | 'any';
  action: FirewallAction;
  source?: string;
  comment?: string;
}

export interface FirewallStatus {
  backend: FirewallBackend;
  active: boolean;
  rules: FirewallRule[];
  raw: string;
}

export interface AddFirewallRuleInput {
  port: number;
  protocol: Protocol;
  action: FirewallAction;
  source?: string;
  comment?: string;
}

export interface RunChunk {
  runId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  ts: number;
}

export interface RunDone {
  runId: string;
  code: number | null;
  signal: string | null;
  durationMs: number;
  error?: string;
}

export interface RunSnapshot {
  runId: string;
  kind?: string;
  label?: string;
  finished: boolean;
  missing?: boolean;
  result: RunDone | null;
  chunks: RunChunk[];
}

const base = (serverId: string) => `/servers/${serverId}/system`;

export const fetchCurated = (serverId: string) =>
  getData<CuratedPackage[]>(`${base(serverId)}/packages/curated`);

export const fetchInstalledPackages = (serverId: string, q?: string) =>
  getData<InstalledPackage[]>(`${base(serverId)}/packages`, q ? { q } : undefined);

export const checkBinaries = (serverId: string, binaries: string[]) =>
  postData<Record<string, boolean>>(`${base(serverId)}/packages/check`, { binaries });

export const installPackages = (serverId: string, packages: string[]) =>
  postData<{ runId: string }>(`${base(serverId)}/packages/install`, { packages });

export const removePackages = (serverId: string, packages: string[], purge = false) =>
  postData<{ runId: string }>(`${base(serverId)}/packages/remove`, { packages, purge });

export const upgradePackages = (serverId: string) =>
  postData<{ runId: string }>(`${base(serverId)}/packages/upgrade`);

export const fetchFirewallStatus = (serverId: string) =>
  getData<FirewallStatus>(`${base(serverId)}/firewall`);

export const enableFirewall = (serverId: string) =>
  postData<{ runId: string }>(`${base(serverId)}/firewall/enable`);

export const disableFirewall = (serverId: string) =>
  postData<{ ok: boolean; output: string }>(`${base(serverId)}/firewall/disable`);

export const addFirewallRule = (serverId: string, body: AddFirewallRuleInput) =>
  postData<FirewallStatus>(`${base(serverId)}/firewall/rules`, body);

export const removeFirewallRule = (serverId: string, ruleId: string) =>
  deleteData<FirewallStatus>(`${base(serverId)}/firewall/rules/${encodeURIComponent(ruleId)}`);

export const fetchRunSnapshot = (serverId: string, runId: string) =>
  getData<RunSnapshot>(`${base(serverId)}/runs/${runId}`);

/** Connect a Socket.io client to /ws/system using the current access token. */
export function connectRunSocket(): Socket {
  const token = useAuthStore.getState().accessToken ?? '';
  const apiBase = (import.meta.env.VITE_API_URL ?? '/api') as string;
  // socket.io wants an origin (not a path). Strip a trailing /api if present;
  // otherwise default to same-origin. Socket.io's transport path lives under
  // /api/socket.io so traefik routes it to the backend in both deployments.
  const url = apiBase.startsWith('http')
    ? apiBase.replace(/\/api\/?$/, '')
    : window.location.origin;
  return io(`${url}/ws/system`, {
    auth: { token },
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });
}
