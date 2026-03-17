import {
  LayoutDashboard, Building2, MapPin, Shield, FileText,
  Users, ScrollText, Settings, Bell, Network, ChevronDown
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS, type AppRole } from '@/types/rbac';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[] | 'all';
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { title: 'Översikt', url: '/', icon: LayoutDashboard, roles: 'all' },
  { title: 'Ansökningar', url: '/applications', icon: FileText, roles: 'all' },
  {
    title: 'Anläggningar', url: '/facilities', icon: Building2,
    roles: ['administrator', 'facility_owner', 'facility_admin'],
    children: [
      { title: 'Områden', url: '/areas', icon: MapPin, roles: ['administrator', 'facility_owner', 'facility_admin'] },
    ],
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { currentUser, activeRole } = useAuth();
  const location = useLocation();

  if (!currentUser) return null;

  const filteredItems = navItems.filter(item =>
    item.roles === 'all' || item.roles.some(r => currentUser.roles.includes(r))
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Shield className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-sidebar-foreground">RBAC Access</h2>
              <p className="text-xs text-sidebar-foreground/60">Tillträdeshantering</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Shield className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && 'Navigation'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map(item => (
                item.children && item.children.length > 0 ? (
                  <Collapsible key={item.url} defaultOpen={location.pathname === item.url || item.children.some(c => location.pathname === c.url)}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink to={item.url} end className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                            <item.icon className="mr-2 h-4 w-4 shrink-0" />
                            {!collapsed && <span className="flex-1">{item.title}</span>}
                            {!collapsed && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />}
                          </NavLink>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="ml-6 border-l border-sidebar-border pl-2 mt-1">
                          {item.children.filter(c => c.roles === 'all' || c.roles.some(r => currentUser.roles.includes(r))).map(child => (
                            <SidebarMenuItem key={child.url}>
                              <SidebarMenuButton asChild>
                                <NavLink to={child.url} className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                                  <child.icon className="mr-2 h-3.5 w-3.5 shrink-0" />
                                  {!collapsed && <span>{child.title}</span>}
                                </NavLink>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end={item.url === '/'} className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                {currentUser.full_name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{currentUser.full_name}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">{ROLE_LABELS[activeRole]}</p>
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
