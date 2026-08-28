import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { SiteSettings, UserRole, UserSession } from '../types';
import { soundManager } from '../utils/sound';

interface AuthContextType {
  session: UserSession | null;
  settings: SiteSettings | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: (reason?: string) => Promise<void>;
  updateSettings: (newSettings: Partial<SiteSettings>) => Promise<boolean>;
  refreshMe: () => Promise<void>;
  timeRemaining: number; // in seconds
  formattedTimeRemaining: string;
  isExpiringSoon: boolean;
  logoutReason: string | null;
  clearLogoutReason: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'kbmax_auth_token';
const SETTINGS_KEY = 'kbmax_site_settings';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [timeRemaining, setTimeRemaining] = useState<number>(300);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [warningPlayed, setWarningPlayed] = useState<boolean>(false);

  const clearLogoutReason = () => setLogoutReason(null);

  const saveSettingsLocally = (newSet: SiteSettings) => {
    setSettings(newSet);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSet));
    } catch {
      // Ignore
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          saveSettingsLocally(data.settings);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const logout = useCallback(async (reason?: string) => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        });
      } catch {
        // Ignore
      }
    }

    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setWarningPlayed(false);
    if (reason) {
      setLogoutReason(reason);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        if (data.settings) {
          setSettings(data.settings);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'SESSION_EXPIRED') {
          logout('Your session has expired. Please log in again.');
        } else {
          logout('Your session is no longer valid or your account was revoked.');
        }
      }
    } catch {
      // network issue
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchSettings();
    refreshMe();
  }, [fetchSettings, refreshMe]);

  // Handle countdown timer (crucial for client role 5-minute timeout)
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      const remainingMs = session.expiresAt - Date.now();
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
      setTimeRemaining(remainingSec);

      // Warning when 60s remaining for client
      if (session.role === 'client' && remainingSec <= 60 && remainingSec > 0 && !warningPlayed) {
        soundManager.playSessionWarning();
        setWarningPlayed(true);
      }

      // Expired!
      if (remainingSec <= 0) {
        clearInterval(interval);
        logout('Your 5-minute session has ended. For security reasons, you have been logged out.');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, logout, warningPlayed]);

  const login = async (username: string, password: string) => {
    try {
      setLogoutReason(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      localStorage.setItem(TOKEN_KEY, data.session.token);
      setSession(data.session);
      if (data.settings) {
        saveSettingsLocally(data.settings);
      }
      setWarningPlayed(false);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error connecting to VPS Gateway' };
    }
  };

  const updateSettings = async (newSettings: Partial<SiteSettings>): Promise<boolean> => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newSettings),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          saveSettingsLocally(data.settings);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const formattedTimeRemaining = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isExpiringSoon = session?.role === 'client' && timeRemaining <= 60;

  return (
    <AuthContext.Provider
      value={{
        session,
        settings,
        isLoading,
        login,
        logout,
        updateSettings,
        refreshMe,
        timeRemaining,
        formattedTimeRemaining,
        isExpiringSoon,
        logoutReason,
        clearLogoutReason,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
