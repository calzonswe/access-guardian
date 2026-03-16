import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AppRole } from '@/types/rbac';
import type { StoredUser } from '@/services/dataStore';
import * as store from '@/services/dataStore';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
  hasRole: (role: AppRole) => boolean;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  changePassword: (newPassword: string) => { success: boolean; error?: string };
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [activeRole, setActiveRole] = useState<AppRole>('employee');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const session = store.getSession();
    if (session) {
      const stored = store.getStoredUser(session.id);
      if (stored) {
        setCurrentUser(stored);
        setActiveRole(stored.roles[0]);
      }
    }
    setInitialized(true);
  }, []);

  const login = useCallback((email: string, password: string) => {
    const user = store.authenticate(email, password);
    if (!user) return { success: false, error: 'Felaktig e-post eller lösenord' };
    if (!user.is_active) return { success: false, error: 'Kontot är inaktiverat' };
    store.setSession(user);
    setCurrentUser(user);
    setActiveRole(user.roles[0]);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    store.clearSession();
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback((newPassword: string) => {
    if (!currentUser) return { success: false, error: 'Ej inloggad' };
    if (newPassword.length < 8) return { success: false, error: 'Lösenordet måste vara minst 8 tecken' };
    store.changePassword(currentUser.id, newPassword);
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
    ? { id: currentUser.id, email: currentUser.email, full_name: currentUser.full_name, roles: currentUser.roles, department: currentUser.department, manager_id: currentUser.manager_id, contact_person_id: currentUser.contact_person_id, company: currentUser.company, is_active: currentUser.is_active, created_at: currentUser.created_at }
    : null;

  if (!initialized) return null;

  return (
    <AuthContext.Provider value={{
      currentUser: publicUser,
      isAuthenticated: !!currentUser,
      mustChangePassword: currentUser?.must_change_password ?? false,
      activeRole,
      setActiveRole,
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
