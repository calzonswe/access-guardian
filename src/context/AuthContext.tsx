import React, { createContext, useContext, useState } from 'react';
import type { User, AppRole } from '@/types/rbac';
import { MOCK_USERS } from '@/data/mock-data';

interface AuthContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  switchRole: (userId: string) => void;
  hasRole: (role: AppRole) => boolean;
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USERS[0]);
  const [activeRole, setActiveRole] = useState<AppRole>(MOCK_USERS[0].roles[0]);

  const switchRole = (userId: string) => {
    const user = MOCK_USERS.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      setActiveRole(user.roles[0]);
    }
  };

  const hasRole = (role: AppRole) => currentUser.roles.includes(role);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, switchRole, hasRole, activeRole, setActiveRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
