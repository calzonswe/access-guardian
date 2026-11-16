import { useMemo } from 'react';
import { ArrowLeft, Download, Search, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { usePersistentState } from '@/hooks/usePersistentState';
import { activeAccessFor, daysLeft, isoDay } from '@/lib/applicationRules';
import { toCsv } from '@/lib/csv';
import { t } from '@/i18n';

const ALL = 'all';

/** "Who has access right now?" for one facility. */
export default function FacilityAccessPage() {
  const { currentUser } = useAuth();
  const { loading } = useDataRefresh();
  const { facilityId = '' } = useParams<{ facilityId: string }>();
  const [search, setSearch] = usePersistentState(`access:${facilityId}:search`, '');
  const [areaFilter, setAreaFilter] = usePersistentState(`access:${facilityId}:area`, ALL);

  const facility = store.getFacility(facilityId);
  const areas = store.getAreas(facilityId);

  // An area filter includes access to the area itself or any area below it.
  const areaAndBelow = useMemo(() => {
    if (areaFilter === ALL) return null;
    const out = new Set([areaFilter]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of areas) if (a.parent_id && out.has(a.parent_id) && !out.has(a.id)) { out.add(a.id); grew = true; }
    }
    return out;
  }, [areaFilter, areas]);

  if (!currentUser) return null;
  const canSee = currentUser.roles.includes('administrator')
    || facility?.owner_id === currentUser.id
    || (facility?.admin_ids || []).includes(currentUser.id);

  const today = new Date();
  const q = search.trim().toLowerCase();
  const rows = activeAccessFor(store.getApplications(), facilityId, today)
    .map(app => ({ app, person: store.getUser(app.applicant_id), left: daysLeft(app, today) }))
    .filter(({ app, person }) => {
      if (areaAndBelow && !(app.area_ids || []).some(id => areaAndBelow.has(id))) return false;
      if (!q) return true;
      return [person?.full_name, person?.email, person?.company].some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => (a.person?.full_name || '').localeCompare(b.person?.full_name || '', 'sv'));

  const areaNames = (ids: string[]) => ids.map(id => areas.find(a => a.id === id)?.name).filter(Boolean).join(', ');
  const approverName = (id?: string) => (id ? store.getUser(id)?.full_name : undefined) ?? (facility?.owner_id === id ? facility?.owner_name : undefined) ?? '–';

  const exportCsv = () => {
    const headers = ['namn', 'epost', 'foretag', 'omraden', 'giltig_fran', 'giltig_till', 'godkand_av'];
    const data = rows.map(({ app, person }) => ({
      namn: person?.full_name || '', epost: person?.email || '', foretag: person?.company || '',
      omraden: areaNames(app.area_ids || []) || t('Hela anläggningen'),
      giltig_fran: app.start_date.slice(0, 10), giltig_till: app.end_date ? app.end_date.slice(0, 10) : t('Tillsvidare'),
      godkand_av: approverName(app.facility_approved_by || app.exception_approved_by),
    }));
    const blob = new Blob(['﻿' + toCsv(data, headers)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aktiva-tilltraden-${(facility?.name || 'anlaggning').replace(/\s+/g, '-').toLowerCase()}-${isoDay(today)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(t('Listan exporterad'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
            <Link to="/facilities"><ArrowLeft className="mr-1 h-4 w-4" />{t('Tillbaka till anläggningar')}</Link>
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{t('Aktiva tillträden')}{facility ? ` – ${facility.name}` : ''}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('Personer med godkänt tillträde som gäller i dag,')} {isoDay(today)}.</p>
        </div>
        {canSee && rows.length > 0 && (
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />{t('Exportera')}</Button>
        )}
      </div>

      {!loading && (!facility || !canSee) ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">{t('Anläggningen finns inte, eller så har du inte behörighet att se dess tillträden.')}</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder={t('Sök namn, e-post eller företag…')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" aria-label={t('Sök')} />
            </div>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-full sm:w-[220px]" aria-label={t('Område')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('Alla områden')}</SelectItem>
                {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" />{rows.length} {rows.length === 1 ? 'person' : 'personer'}</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{loading ? t('Laddar…') : t('Ingen har tillträde som matchar urvalet.')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Person')}</TableHead>
                        <TableHead>{t('Företag')}</TableHead>
                        <TableHead>{t('Områden')}</TableHead>
                        <TableHead>{t('Giltig från')}</TableHead>
                        <TableHead>{t('Giltig till')}</TableHead>
                        <TableHead>{t('Godkänd av')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ app, person, left }) => (
                        <TableRow key={app.id}>
                          <TableCell>
                            <Link to={`/applications/${app.id}`} className="font-medium text-foreground hover:underline">{person?.full_name ?? '–'}</Link>
                            <div className="text-xs text-muted-foreground">{person?.email}</div>
                          </TableCell>
                          <TableCell>{person?.company || '–'}</TableCell>
                          <TableCell className="max-w-[16rem]">{areaNames(app.area_ids || []) || <span className="text-muted-foreground">{t('Hela anläggningen')}</span>}</TableCell>
                          <TableCell className="whitespace-nowrap">{app.start_date.slice(0, 10)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {app.end_date ? app.end_date.slice(0, 10) : t('Tillsvidare')}
                            {left !== null && left <= 30 && (
                              <Badge variant="outline" className="ml-2 status-badge-pending">{left === 0 ? t('Går ut i dag') : `${left} dagar kvar`}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{approverName(app.facility_approved_by || app.exception_approved_by)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
