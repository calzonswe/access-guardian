import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AppRole } from '@/types/rbac';
import type { StoredUser } from '@/services/dataStore';
import * as store from '@/services/dataStore';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  hasRole: (role: AppRole) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await store.initPromise;
      const session = store.getSession();
      if (session) {
        const stored = store.getStoredUser(session.id);
        if (stored) {
          setCurrentUser(stored);
        }
      }
      setInitialized(true);
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await store.authenticate(email, password);
    if (!user) return { success: false, error: 'Felaktig e-post eller lösenord' };
    if (!user.is_active) return { success: false, error: 'Kontot är inaktiverat' };
    store.setSession(user);
    setCurrentUser(user);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    store.clearSession();
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    if (!currentUser) return { success: false, error: 'Ej inloggad' };
    if (newPassword.length < 8) return { success: false, error: 'Lösenordet måste vara minst 8 tecken' };
    await store.changePassword(currentUser.id, newPassword);
    const updated = store.getStoredUser(currentUser.id);
    if (updated) {
      setCurrentUser(updated);
      store.setSession(updated);
    }
    return { success: true };
  }, [currentUser]);

  const refreshUser = useCallback(() => {
    if (!currentUser) return;
    const updated = store.getStoredUser(currentUser.id);
    if (updated) setCurrentUser(updated);
  }, [currentUser]);

  const hasRole = useCallback((role: AppRole) => {
    return currentUser?.roles.includes(role) ?? false;
  }, [currentUser]);

  const publicUser: User | null = currentUser
    ? (() => { const { password, must_change_password, ...pub } = currentUser; return pub; })()
    : null;

  if (!initialized) return null;

  return (
    <AuthContext.Provider value={{
      currentUser: publicUser,
      isAuthenticated: !!currentUser,
      mustChangePassword: currentUser?.must_change_password ?? false,
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
