export type UserRole = 'admin' | 'client';

export interface UserSession {
  token: string;
  userId: string;
  username: string;
  role: UserRole;
  expiresAt: number; // Unix timestamp (ms)
  createdAt: number;
  allowedServices?: string[];
}

export interface ClientAccount {
  id: string;
  username: string;
  password?: string; // only visible when creating/updating or in admin secure view
  allowedServices: string[]; // e.g. ["*"] for all or ["WhatsApp", "Telegram", "Google"]
  status: 'active' | 'inactive';
  createdAt: number;
  notes?: string;
  activeSessionsCount?: number;
  lastActive?: number;
}

export interface Partition {
  id: string;
  name: string;
  createdAt?: number;
}

export interface ApiProviderMapping {
  phoneField: string;
  senderField: string;
  messageField: string;
  otpField?: string;
  serviceField?: string;
  timestampField?: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  partId?: string;
  partName?: string;
  part?: 1 | 2 | string | number;
  apiUrl: string;
  apiToken?: string;
  maxRecords?: number;
  tokenParam?: string;
  recordsParam?: string;
  dt1Param?: string;
  dt2Param?: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  params?: Record<string, string>;
  fieldMapping: ApiProviderMapping;
  autoSync: boolean;
  syncIntervalSec: number;
  lastSyncTime?: number;
  lastSyncStatus?: 'success' | 'failed' | 'idle' | 'running';
  lastSyncError?: string;
  totalFetched: number;
  webhookSecret: string;
  enabled: boolean;
  createdAt: number;
}

export interface SmsMessage {
  id: string;
  phone: string;
  sender: string;
  service: string;
  country?: string;
  cli?: string;
  message: string;
  otp?: string;
  timestamp: number;
  partId?: string;
  partName?: string;
  part?: 1 | 2 | string | number;
  providerId?: string;
  providerName?: string;
  ipAddress?: string;
  isNew?: boolean;
}

export type ThemePreset = 'emerald' | 'cyan' | 'sapphire' | 'violet' | 'amber' | 'crimson';

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoType: 'icon' | 'custom_url';
  customLogoUrl: string;
  theme: ThemePreset;
  darkMode: boolean;
  clientSessionMinutes: number;
  enableSoundByDefault: boolean;
  webhookToken: string;
  adminUsername: string;
}

export interface SystemStats {
  totalSms: number;
  todaySms: number;
  activeClients: number;
  activeProviders: number;
  activeSessions: number;
  recentOtpCount: number;
  topServices: { service: string; count: number }[];
}
