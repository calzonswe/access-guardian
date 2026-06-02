import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { User, AppRole } from '@/types/rbac';
import type { StoredUser } from '@/services/dataStore';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  hasRole: (role: AppRole) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (newPassword: string) => Promise<void>;
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
          try {
            const { user, mustChangePassword: mcp, sessionTimeoutMinutes: sto } = await api.getMe();
            setCurrentUser(user);
            setMustChangePassword(mcp);
            if (sto) setSessionTimeoutMinutes(sto);
            await store.refreshAll();
          } catch {
            api.setToken(null);
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
        await store.refreshAll();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Inloggningen misslyckades' };
      }
    } else {
      const user = await store.authenticate(email, password);
      if (!user) return { success: false, error: 'Felaktig e-post eller lösenord' };
      if (!user.is_active) return { success: false, error: 'Kontot är inaktiverat' };
      store.setSession(user);
      const { password: _, must_change_password, ...pub } = user;
      setCurrentUser(pub);
      setMustChangePassword(must_change_password);
      return { success: true };
    }
  }, []);

  const logout = useCallback(() => {
    store.clearSession();
    api.setToken(null);
    setCurrentUser(null);
    setMustChangePassword(false);
    setSessionTimeoutMinutes(0);
  }, []);

  // Auto-logout on idle when a server-driven session timeout is known.
  useIdleTimeout(!!currentUser && sessionTimeoutMinutes > 0, sessionTimeoutMinutes, () => {
    toast.info('Du har loggats ut på grund av inaktivitet');
    logout();
  });

  const changePassword = useCallback(async (newPassword: string) => {
    if (!currentUser) throw new Error('Ej inloggad');
    if (newPassword.length < 8) throw new Error('Lösenordet måste vara minst 8 tecken');
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      throw new Error('Lösenordet måste innehålla stora och små bokstäver, siffror och specialtecken');
    }

    if (store.isApiMode()) {
      const res = await api.changePassword(newPassword);
      setCurrentUser(res.user);
      setMustChangePassword(false);
    } else {
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

  if (!initialized) return null;

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
