import { useState } from 'react';
import { Bell, Moon, Sun, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';

export function AppHeader() {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [, setRefresh] = useState(0);

  if (!currentUser) return null;

  const notifications = store.getNotifications(currentUser.id);
  const unread = notifications.filter(n => !n.read);
  const recent = notifications.slice(0, 5);

  const markRead = async (id: string) => {
    if (store.isApiMode()) {
      try {
        await api.markNotificationRead(id);
        await store.refreshAll();
      } catch { /* ignore */ }
    } else {
      const all = store.getNotifications(currentUser.id);
      const n = all.find(x => x.id === id);
      if (n && !n.read) {
        n.read = true;
        const allNotifs = JSON.parse(localStorage.getItem('rbac_notifications') || '[]');
        const idx = allNotifs.findIndex((x: any) => x.id === id);
        if (idx >= 0) { allNotifs[idx].read = true; localStorage.setItem('rbac_notifications', JSON.stringify(allNotifs)); }
      }
    }
    setRefresh(x => x + 1);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <div className="flex-1" />

      {/* Notifications dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {unread.length > 0 && (
              <Badge className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground">
                {unread.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="px-3 py-2 text-sm font-medium text-foreground">
            Aviseringar {unread.length > 0 && `(${unread.length} olästa)`}
          </div>
          <DropdownMenuSeparator />
          {recent.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">Inga aviseringar</div>
          ) : (
            recent.map(n => (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer ${!n.read ? 'bg-primary/5' : ''}`}
                onClick={() => { markRead(n.id); if (n.link) navigate(n.link); }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium truncate flex-1">{n.title}</span>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                </div>
                <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="justify-center text-sm text-primary cursor-pointer" onClick={() => navigate('/notifications')}>
            Visa alla aviseringar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      {/* Logout */}
      <Button variant="ghost" size="icon" onClick={logout} title="Logga ut">
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );
}
