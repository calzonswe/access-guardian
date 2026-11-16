import {
  LayoutDashboard, Building2, Shield, FileText,
  Users, ScrollText, Settings, Bell, Network,
} from 'lucide-react';
import type { AppRole } from '@/types/rbac';

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[] | 'all';
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  { title: 'Översikt', url: '/', icon: LayoutDashboard, roles: 'all' },
  { title: 'Ansökningar', url: '/applications', icon: FileText, roles: 'all' },
  {
    title: 'Anläggningar', url: '/facilities', icon: Building2,
    roles: ['administrator', 'facility_owner', 'facility_admin'],
  },
  { title: 'Krav', url: '/requirements', icon: Shield, roles: ['administrator', 'facility_owner', 'facility_admin', 'line_manager'] },
  { title: 'Användare', url: '/users', icon: Users, roles: ['administrator'] },
  { title: 'Organisation', url: '/organization', icon: Network, roles: ['administrator'] },
  { title: 'Mitt team', url: '/team', icon: Users, roles: ['line_manager'] },
  { title: 'Min åtkomst', url: '/my-access', icon: Shield, roles: ['employee', 'contractor'] },
  { title: 'Aviseringar', url: '/notifications', icon: Bell, roles: 'all' },
  { title: 'Systemlogg', url: '/logs', icon: ScrollText, roles: ['administrator'] },
  { title: 'Inställningar', url: '/settings', icon: Settings, roles: ['administrator'] },
];

/** Menu items a user with these roles may open. */
export function navItemsFor(roles: AppRole[]): NavItem[] {
  return navItems.filter(item => item.roles === 'all' || item.roles.some(r => roles.includes(r)));
}
