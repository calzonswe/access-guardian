import { useEffect, useState } from 'react';
import { Bell, Moon, Sun, Monitor, LogOut, User as UserIcon, Check, Search, Languages } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { useNavigate, useLocation } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { ROLE_LABELS } from '@/types/rbac';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import { t, getLanguage, setLanguage, type Language } from '@/i18n';

const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/applications', t('Ansökningar')],
  ['/facilities', t('Anläggningar')],
  ['/requirements', t('Krav')],
  ['/users', t('Användare')],
  ['/organization', t('Organisation')],
  ['/team', t('Mitt team')],
  ['/my-access', t('Min åtkomst')],
  ['/notifications', t('Aviseringar')],
  ['/logs', t('Systemlogg')],
  ['/settings', t('Inställningar')],
  ['/profile', t('Min profil')],
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: t('Ljust'), icon: Sun },
  { value: 'dark', label: t('Mörkt'), icon: Moon },
  { value: 'system', label: t('Följ systemet'), icon: Monitor },
];

export function AppHeader() {
  const { currentUser, logout } = useAuth();
  const { theme, preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [, setRefresh] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / ⌘K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const changeLanguage = async (lang: Language) => {
    if (lang === getLanguage()) return;
    try {
      if (store.isApiMode() && currentUser) await store.updateOwnProfile(currentUser.id, { language: lang });
    } catch { /* still switch locally */ }
    setLanguage(lang);
  };
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

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
        const idx = allNotifs.findIndex((x: { id: string }) => x.id === id);
        if (idx >= 0) { allNotifs[idx].read = true; localStorage.setItem('rbac_notifications', JSON.stringify(allNotifs)); }
      }
    }
    setRefresh(x => x + 1);
  };

  const pageTitle = pathname === '/' ? t('Översikt') : PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? '';
  const initials = currentUser.full_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const roleLabels = currentUser.roles.map(r => ROLE_LABELS[r]).join(', ');

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-3 sm:px-4">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" aria-label={t('Visa eller dölj menyn')} title={t('Visa eller dölj menyn')} />
      <span className="truncate text-sm font-medium text-foreground">{pageTitle}</span>
      <div className="flex-1" />

      <Button variant="outline" onClick={() => setSearchOpen(true)} aria-label={t('Sök')} title={t('Sök')}
        className="h-9 gap-2 px-2 text-muted-foreground sm:w-56 sm:justify-start sm:px-3">
        <Search className="h-4 w-4" />
        <span className="hidden text-sm sm:inline">{t('Sök…')}</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-sans text-[10px] sm:inline">{isMac ? '⌘K' : t('Ctrl K')}</kbd>
      </Button>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />


      {/* Notifications dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" title={t('Aviseringar')}
            aria-label={unread.length > 0 ? t('Aviseringar, {count} olästa', { count: unread.length }) : t('Aviseringar')}>
            <Bell className="h-4 w-4" />
            {unread.length > 0 && (
              <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 py-0 text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive">
                {unread.length > 9 ? '9+' : unread.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="px-3 py-2 text-sm font-medium text-foreground">
            {t('Aviseringar')} {unread.length > 0 && t('({count} olästa)', { count: unread.length })}
          </div>
          <DropdownMenuSeparator />
          {recent.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">{t('Inga aviseringar')}</div>
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
            {t('Visa alla aviseringar')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme: light / dark / follow the device */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title={t('Tema')} aria-label={t('Välj tema')}>
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('Tema')}</DropdownMenuLabel>
          {THEME_OPTIONS.map(opt => (
            <DropdownMenuItem key={opt.value} className="cursor-pointer gap-2" onClick={() => setPreference(opt.value)}>
              <opt.icon className="h-4 w-4" />
              <span className="flex-1">{opt.label}</span>
              {preference === opt.value && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label={t('Användarmeny för {full_name}', { full_name: currentUser.full_name })}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium md:inline">{currentUser.full_name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">{currentUser.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{roleLabels}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/profile')}>
            <UserIcon className="h-4 w-4" />{t('Min profil')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('Språk')}</DropdownMenuLabel>
          {(['sv', 'en'] as const).map(lang => (
            <DropdownMenuItem key={lang} lang={lang} className="cursor-pointer gap-2" onClick={() => changeLanguage(lang)}>
              <Languages className="h-4 w-4" />
              <span className="flex-1">{lang === 'sv' ? 'Svenska' : 'English'}</span>
              {getLanguage() === lang && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={logout}>
            <LogOut className="h-4 w-4" />{t('Logga ut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
