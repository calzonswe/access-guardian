import { Bell, Moon, Sun, ChevronDown } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ROLE_LABELS } from '@/types/rbac';
import { MOCK_USERS, MOCK_NOTIFICATIONS } from '@/data/mock-data';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export function AppHeader() {
  const { currentUser, switchRole, activeRole, setActiveRole } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const unreadCount = MOCK_NOTIFICATIONS.filter(n => n.user_id === currentUser.id && !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

      <div className="flex-1" />

      {/* Demo: Role switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            Byt användare
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Demo – Byt användare</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MOCK_USERS.map(user => (
            <DropdownMenuItem
              key={user.id}
              onClick={() => switchRole(user.id)}
              className={currentUser.id === user.id ? 'bg-accent' : ''}
            >
              <div>
                <p className="text-sm font-medium">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {user.roles.map(r => ROLE_LABELS[r]).join(', ')}
                </p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Role selector if user has multiple */}
      {currentUser.roles.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              {ROLE_LABELS[activeRole]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Aktiv roll</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {currentUser.roles.map(role => (
              <DropdownMenuItem key={role} onClick={() => setActiveRole(role)}>
                {ROLE_LABELS[role]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground">
            {unreadCount}
          </Badge>
        )}
      </Button>

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>
    </header>
  );
}
