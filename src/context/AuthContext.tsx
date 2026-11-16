import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { User, AppRole } from '@/types/rbac';
import type { StoredUser } from '@/services/dataStore';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { errorMessage } from '@/lib/utils';
import { t } from '@/i18n';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  hasRole: (role: AppRole) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(0);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Soft 401: clear auth state instead of full page reload.
    api.setUnauthorizedHandler(() => {
      setCurrentUser(null);
      setMustChangePassword(false);
      setSessionTimeoutMinutes(0);
    });
    const init = async () => {
      await store.initPromise;

      if (store.isApiMode()) {
        // API mode: check if we have a token
        const token = api.getToken();
        if (token) {
          // Only an explicit 401 ends the session. Rate limiting (429) or a
          // server hiccup (5xx/network) is retried and never deletes the token.
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const { user, mustChangePassword: mcp, sessionTimeoutMinutes: sto } = await api.getMe();
              setCurrentUser(user);
              setMustChangePassword(mcp);
              if (sto) setSessionTimeoutMinutes(sto);
              if (!mcp) await store.refreshAll({ maxAgeMs: 30_000 });
              break;
            } catch (err) {
              if (api.isUnauthorizedError(err)) { api.setToken(null); break; }
              if (attempt === 2) {
                toast.error(t('Kunde inte nå servern. Ladda om sidan om en stund.'));
              } else {
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
              }
            }
          }
        }
      } else {
        // Local mode
        const session = store.getSession();
        if (session) {
          const stored = store.getStoredUser(session.id);
          if (stored) {
            const { password, must_change_password, ...pub } = stored;
            setCurrentUser(pub);
            setMustChangePassword(must_change_password);
          }
        }
      }
      setInitialized(true);
    };
    init();
    return () => api.setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (store.isApiMode()) {
      try {
        const res = await api.login(email, password);
        setCurrentUser(res.user);
        setMustChangePassword(res.mustChangePassword);
        if (res.sessionTimeoutMinutes) setSessionTimeoutMinutes(res.sessionTimeoutMinutes);
        // Nothing can be loaded until a forced password change is done.
        if (!res.mustChangePassword) await store.refreshAll();
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err, t('Inloggningen misslyckades')) };
      }
    } else {
      const user = await store.authenticate(email, password);
      if (!user) return { success: false, error: t('Felaktig e-post eller lösenord') };
      if (!user.is_active) return { success: false, error: t('Kontot är inaktiverat') };
      store.setSession(user);
      const { password: _, must_change_password, ...pub } = user;
      setCurrentUser(pub);
      setMustChangePassword(must_change_password);
      return { success: true };
    }
  }, []);

  const logout = useCallback(() => {
    store.clearSession();
    store.clearCache();
    api.setToken(null);
    setCurrentUser(null);
    setMustChangePassword(false);
    setSessionTimeoutMinutes(0);
  }, []);

  // Sliding session: while the user is active, renew the token before it
  // expires (its lifetime equals the idle timeout).
  useEffect(() => {
    if (!currentUser || !store.isApiMode() || sessionTimeoutMinutes <= 0) return;
    const lifetimeSec = sessionTimeoutMinutes * 60;
    let lastActivity = Date.now();
    const markActive = () => { lastActivity = Date.now(); };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true } as AddEventListenerOptions);
    const checkEvery = Math.min(5 * 60, Math.max(30, lifetimeSec / 4)) * 1000;
    const timer = setInterval(() => {
      const age = api.getTokenAgeSeconds();
      const recentlyActive = Date.now() - lastActivity < checkEvery * 2;
      if (recentlyActive && age !== null && age > lifetimeSec / 3) {
        api.refreshToken().catch(() => { /* a 401 is handled by the unauthorized handler */ });
      }
    }, checkEvery);
    return () => {
      clearInterval(timer);
      for (const ev of events) window.removeEventListener(ev, markActive);
    };
  }, [currentUser, sessionTimeoutMinutes]);

  // Auto-logout on idle when a server-driven session timeout is known.
  useIdleTimeout(!!currentUser && sessionTimeoutMinutes > 0, sessionTimeoutMinutes, () => {
    toast.info(t('Du har loggats ut på grund av inaktivitet'));
    logout();
  });

  const changePassword = useCallback(async (newPassword: string, currentPassword?: string) => {
    if (!currentUser) throw new Error(t('Ej inloggad'));

    if (store.isApiMode()) {
      // The server validates against the configurable password policy.
      const res = await api.changePassword(newPassword, currentPassword);
      setCurrentUser(res.user);
      setMustChangePassword(false);
      await store.refreshAll();
    } else {
      if (newPassword.length < 8) throw new Error(t('Lösenordet måste vara minst 8 tecken'));
      if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        throw new Error(t('Lösenordet måste innehålla stora och små bokstäver, siffror och specialtecken'));
      }
      await store.changePassword(currentUser.id, newPassword);
      const updated = store.getStoredUser(currentUser.id);
      if (updated) {
        store.setSession(updated);
        const { password: _, must_change_password, ...pub } = updated;
        setCurrentUser(pub);
        setMustChangePassword(must_change_password);
      }
    }
  }, [currentUser]);

  const refreshUser = useCallback(() => {
    if (!currentUser) return;
    if (store.isApiMode()) {
      api.getMe().then(({ user, mustChangePassword: mcp }) => {
        setCurrentUser(user);
        setMustChangePassword(mcp);
      }).catch(() => {});
    } else {
      const updated = store.getStoredUser(currentUser.id);
      if (updated) {
        const { password: _, must_change_password, ...pub } = updated;
        setCurrentUser(pub);
        setMustChangePassword(must_change_password);
      }
    }
  }, [currentUser]);

  const hasRole = useCallback((role: AppRole) => {
    return currentUser?.roles.includes(role) ?? false;
  }, [currentUser]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm">{t('Laddar…')}</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser,
      mustChangePassword,
      hasRole,
      login,
      logout,
      changePassword,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
