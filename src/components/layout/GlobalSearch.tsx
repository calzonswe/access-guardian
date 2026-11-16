import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, User as UserIcon, Building2, CornerDownLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { matches } from '@/lib/search';
import { navItemsFor } from './navItems';
import { t } from '@/i18n';

const PER_GROUP = 5;

const STATUS_LABELS: Record<string, string> = {
  draft: t('Utkast'), pending_manager: t('Väntar på chef'), pending_facility: t('Väntar på anläggning'),
  pending_exception: t('Avsteg – väntar'), approved: t('Godkänd'), denied: t('Nekad'), expired: t('Utgången'),
};

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  go: () => void;
}

/** Ctrl/⌘+K search over pages, applications, people and facilities the user can already see. */
export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  const results = useMemo<Result[]>(() => {
    if (!currentUser) return [];
    const roles = currentUser.roles;
    const isAdmin = roles.includes('administrator');
    const go = (fn: () => void) => () => { onOpenChange(false); fn(); };
    const q = query.trim();

    const pages: Result[] = navItemsFor(roles)
      .filter(item => !q || matches(q, item.title))
      .map(item => ({ id: `page:${item.url}`, group: t('Sidor'), label: item.title, icon: item.icon, go: go(() => navigate(item.url)) }));
    if (!q) return pages; // empty query: just the pages

    const apps: Result[] = store.getApplications()
      .filter(a => {
        const user = store.getUser(a.applicant_id);
        const fac = store.getFacility(a.facility_id);
        return matches(q, user?.full_name, user?.company, fac?.name, STATUS_LABELS[a.status]);
      })
      .slice(0, PER_GROUP)
      .map(a => {
        const user = store.getUser(a.applicant_id);
        const fac = store.getFacility(a.facility_id);
        return {
          id: `app:${a.id}`, group: t('Ansökningar'), icon: FileText,
          label: `${user?.full_name ?? t('Okänd')} – ${fac?.name ?? t('okänd anläggning')}`,
          hint: STATUS_LABELS[a.status],
          go: go(() => navigate(`/applications/${a.id}`)),
        };
      });

    // People: only useful where there is somewhere to show them.
    const canOpenPeople = isAdmin || roles.includes('line_manager');
    const people: Result[] = !canOpenPeople ? [] : store.getUsers()
      .filter(u => u.id !== currentUser.id && matches(q, u.full_name, u.email, u.company))
      .slice(0, PER_GROUP)
      .map(u => ({
        id: `user:${u.id}`, group: t('Personer'), icon: UserIcon, label: u.full_name, hint: u.email,
        go: go(() => {
          if (isAdmin) {
            // Open Användare filtered on this person (the filter is remembered per tab).
            try { sessionStorage.setItem('ag:filter:users:search', JSON.stringify(u.email)); } catch { /* ignore */ }
            navigate('/users');
          } else {
            navigate('/team');
          }
        }),
      }));

    const canManage = (f: { owner_id?: string; admin_ids?: string[] }) =>
      isAdmin || f.owner_id === currentUser.id || (f.admin_ids || []).includes(currentUser.id);
    const facilities: Result[] = store.getFacilities()
      .filter(f => matches(q, f.name, f.address, f.description))
      .slice(0, PER_GROUP)
      .map(f => ({
        id: `fac:${f.id}`, group: t('Anläggningar'), icon: Building2, label: f.name, hint: f.address,
        go: go(() => navigate(canManage(f) ? `/facilities/${f.id}/areas` : (roles.some(r => ['facility_owner', 'facility_admin'].includes(r)) ? '/facilities' : '/applications'))),
      }));

    return [...pages.slice(0, PER_GROUP), ...apps, ...people, ...facilities];
  }, [query, currentUser, navigate, onOpenChange]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); results[active]?.go(); }
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('Sök')}</DialogTitle>
        <DialogDescription className="sr-only">{t('Sök efter sidor, ansökningar, personer och anläggningar. Använd piltangenterna och Enter.')}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('Sök sidor, ansökningar, personer, anläggningar…')}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-results"
            aria-activedescendant={results[active] ? `gs-${active}` : undefined}
            aria-label={t('Sök')}
          />
        </div>
        <div ref={listRef} id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('Inga träffar')}</p>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header && <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{header}</p>}
                <div
                  id={`gs-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={r.go}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm ${i === active ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}
                >
                  <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">{r.hint}</span>}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span><kbd className="font-sans">↑↓</kbd> {t('välj')}</span>
          <span><kbd className="font-sans">{t('Enter')}</kbd> {t('öppna')}</span>
          <span><kbd className="font-sans">{t('Esc')}</kbd> {t('stäng')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
