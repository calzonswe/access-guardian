import { useEffect, useState } from 'react';
import { ScrollText, Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import LogAnalysisPanel from '@/components/logs/LogAnalysisPanel';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { usePersistentState } from '@/hooks/usePersistentState';
import { HISTORY_LABELS } from '@/components/applications/ApplicationHistory';
import { toCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/utils';
import { isoDay } from '@/lib/applicationRules';
import type { SystemLog } from '@/types/rbac';
import { t as tr, locale } from '@/i18n';

/** Swedish labels for the actions the backend writes to the audit log. */
const ACTION_LABELS: Record<string, string> = {
  ...HISTORY_LABELS,
  application_deleted: tr('Ansökan borttagen'),
  login_success: tr('Inloggning'),
  login_failed: tr('Misslyckad inloggning'),
  password_changed: tr('Lösenord bytt'),
  password_reset_requested: tr('Lösenordsåterställning begärd'),
  password_reset_completed: tr('Lösenord återställt'),
  user_created: tr('Användare skapad'),
  user_updated: tr('Användare ändrad'),
  user_deleted: tr('Användare borttagen'),
  requirement_fulfilled: tr('Krav registrerat'),
  requirement_expired: tr('Krav utgånget'),
  facility_created: tr('Anläggning skapad'),
  facility_updated: tr('Anläggning ändrad'),
  facility_deleted: tr('Anläggning borttagen'),
  facility_admin_added: tr('Anläggningsadministratör tillagd'),
  facility_admin_removed: tr('Anläggningsadministratör borttagen'),
  area_created: tr('Område skapat'),
  area_updated: tr('Område ändrat'),
  area_deleted: tr('Område borttaget'),
  settings_updated: tr('Inställningar ändrade'),
  audit_ai_query: 'AI-analys av loggen',
};
const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/_/g, ' ');

const PAGE_SIZE = 50;
const EXPORT_MAX = 10000;

type LogRow = SystemLog & { actor_name?: string | null };

export default function LogsPage() {
  const { loading } = useDataRefresh();
  const apiMode = store.isApiMode();
  const [q, setQ] = usePersistentState('logs:q', '');
  const [action, setAction] = usePersistentState('logs:action', 'all');
  const [from, setFrom] = usePersistentState('logs:from', '');
  const [to, setTo] = usePersistentState('logs:to', '');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [fetching, setFetching] = useState(false);

  // Search as you type, without one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!apiMode || loading) return;
    let cancelled = false;
    setFetching(true);
    api.getLogsPage({ page, pageSize: PAGE_SIZE, q: debouncedQ.trim() || undefined, from: from || undefined, to: to || undefined, action })
      .then(r => { if (!cancelled) { setItems(r.items); setTotal(r.total); } })
      .catch(err => { if (!cancelled) toast.error(errorMessage(err, tr('Kunde inte hämta loggen'))); })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [apiMode, loading, page, debouncedQ, from, to, action]);

  // localStorage mode: filter the local log in the browser.
  const localRows: LogRow[] = apiMode ? [] : store.getLogs().filter(l => {
    const name = store.getUser(l.actor_id)?.full_name || '';
    const text = `${l.action} ${l.details || ''} ${name}`.toLowerCase();
    const day = l.created_at.slice(0, 10);
    return (!debouncedQ.trim() || text.includes(debouncedQ.trim().toLowerCase()))
      && (action === 'all' || l.action === action)
      && (!from || day >= from) && (!to || day <= to);
  });
  const rows = apiMode ? items : localRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const count = apiMode ? total : localRows.length;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilter = !!(q || from || to || action !== 'all');
  const actorName = (l: LogRow) => l.actor_name ?? store.getUser(l.actor_id)?.full_name ?? '–';

  const clearFilters = () => { setQ(''); setAction('all'); setFrom(''); setTo(''); setPage(1); };

  const exportFiltered = async () => {
    try {
      let all: LogRow[] = localRows;
      if (apiMode) {
        const r = await api.getLogsPage({ page: 1, pageSize: EXPORT_MAX, q: debouncedQ.trim() || undefined, from: from || undefined, to: to || undefined, action });
        all = r.items;
        if (r.total > EXPORT_MAX) toast.info(tr('Exporten innehåller de senaste {EXPORT_MAX} av {total} poster', { EXPORT_MAX, total: r.total }));
      }
      const csv = toCsv(all.map(l => ({
        tidpunkt: new Date(l.created_at).toLocaleString(locale()),
        handelse: actionLabel(l.action),
        anvandare: actorName(l),
        detaljer: l.details || '',
      })), ['tidpunkt', 'handelse', 'anvandare', 'detaljer']);
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `systemlogg_${isoDay(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(tr('Logg exporterad'));
    } catch (err) {
      toast.error(errorMessage(err, tr('Exporten misslyckades')));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{tr('Systemlogg')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{count} {hasFilter ? 'poster matchar filtret' : 'poster'}</p>
        </div>
        {count > 0 && (
          <Button variant="outline" onClick={exportFiltered}><Download className="mr-2 h-4 w-4" />{tr('Exportera')}{hasFilter ? ' urval' : ''}</Button>
        )}
      </div>

      <LogAnalysisPanel />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-1">
            <Label htmlFor="log-q" className="text-xs">{tr('Sök')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="log-q" className="pl-9" placeholder={tr('Användare, händelse eller detaljer…')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tr('Händelse')}</Label>
            <Select value={action} onValueChange={v => { setAction(v); setPage(1); }}>
              <SelectTrigger aria-label={tr('Händelse')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('Alla händelser')}</SelectItem>
                {Object.keys(ACTION_LABELS).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), 'sv')).map(a => (
                  <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-from" className="text-xs">{tr('Från')}</Label>
            <Input id="log-from" type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-to" className="text-xs">{tr('Till och med')}</Label>
            <Input id="log-to" type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} />
          </div>
          <Button variant="ghost" onClick={clearFilters} disabled={!hasFilter} className="justify-self-start">
            <X className="mr-1 h-4 w-4" />{tr('Rensa')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="h-12 w-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
              <p className="text-muted-foreground">{fetching || loading ? 'Laddar…' : tr('Inga loggposter matchar filtret')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Tid')}</TableHead>
                    <TableHead>{tr('Användare')}</TableHead>
                    <TableHead>{tr('Händelse')}</TableHead>
                    <TableHead>{tr('Detaljer')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString(locale())}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{actorName(log)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs whitespace-nowrap">{actionLabel(log.action)}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>{tr('Föregående')}</Button>
          <span className="text-sm text-muted-foreground">{tr('Sida')} {page} av {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{tr('Nästa')}</Button>
        </div>
      )}
    </div>
  );
}
