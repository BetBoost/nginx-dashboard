export type Role = 'ADMIN' | 'USER';

export type SubdomainStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export type SslStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'ERROR';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'key' | 'password';
  nginxPath: string;
  sitesAvailable: string;
  sitesEnabled: string;
  reloadCommand: string;
  testCommand: string;
  certbotEnabled: boolean;
  isActive: boolean;
  lastSeenAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { subdomains: number };
}

export interface Subdomain {
  id: string;
  name: string;
  serverId: string;
  upstreamHost: string;
  upstreamPort: number;
  upstreamScheme: 'http' | 'https';
  forceHttps: boolean;
  websocket: boolean;
  customDirectives?: string | null;
  clientMaxBodySize?: string | null;
  status: SubdomainStatus;
  sslStatus: SslStatus;
  sslExpiresAt?: string | null;
  lastReloadOk?: boolean | null;
  lastError?: string | null;
  configPath?: string | null;
  enabledPath?: string | null;
  createdAt: string;
  updatedAt: string;
  server?: { id: string; name: string; host: string };
}

export interface AuditLog {
  id: string;
  action: string;
  actorId?: string | null;
  actor?: { id: string; email: string; name?: string | null } | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Overview {
  serverCount: number;
  subdomainCount: number;
  activeSubdomains: number;
  errorSubdomains: number;
  expiringSoon: number;
}

export interface SubdomainRemoveSummary {
  id: string;
  name: string;
  dbDeleted: boolean;
  nginx: { configRemoved: boolean; enabledRemoved: boolean; reloadOk: boolean };
  ssl: { liveRemoved: boolean; renewalRemoved: boolean; archiveRemoved: boolean };
  warnings: string[];
}
