import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import * as store from '@/services/dataStore';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';
import { ApplicationFormDialog } from '@/components/applications/ApplicationFormDialog';
import { ApplicationDetailDialog } from '@/components/applications/ApplicationDetailDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { exportApplications } from '@/services/exportService';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useActionableApplications } from '@/hooks/useActionableApplications';
import { errorMessage } from '@/lib/utils';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alla statusar' },
  { value: 'draft', label: 'Utkast' },
  { value: 'pending_manager', label: 'Väntar på chef' },
  { value: 'pending_facility', label: 'Väntar på anläggning' },
  { value: 'pending_exception', label: 'Avsteg – väntar' },
  { value: 'approved', label: 'Godkänd' },
  { value: 'denied', label: 'Nekad' },
  { value: 'expired', label: 'Utgången' },
];

function getSubordinateIds(managerId: string, users: ReturnType<typeof store.getUsers>): string[] {
  const direct = users.filter(u => u.manager_id === managerId || u.contact_person_id === managerId);
  const ids = direct.map(u => u.id);
  for (const d of direct) {
    const subIds = getSubordinateIds(d.id, users);
    for (const id of subIds) { if (!ids.includes(id)) ids.push(id); }
  }
  return ids;
}

export default function ApplicationsPage() {
  const { currentUser } = useAuth();
  const { loading, reload } = useDataRefresh();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [search, setSearch] = usePersistentState('applications:search', '');
  const [statusFilter, setStatusFilter] = usePersistentState<string>('applications:status', 'all');
  const actionable = useActionableApplications(currentUser);
  // "Att hantera" is computed from the cached applications, not the server page.
  const showActionable = statusFilter === 'actionable';
  const [page, setPage] = useState(1);
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const roles = currentUser?.roles ?? [];

  // Deep link from notifications: /applications/:applicationId opens the detail dialog.
  useEffect(() => {
    if (!applicationId || loading) return;
    const cached = store.getApplication(applicationId);
    if (cached) { setSelectedApp(cached); return; }
    if (!store.isApiMode()) { toast.error('Ansökan hittades inte'); return; }
    let cancelled = false;
    store.fetchApplication(applicationId)
      .then(app => { if (!cancelled) setSelectedApp(app); })
      .catch(err => { if (!cancelled) toast.error(err instanceof Error ? err.message : 'Ansökan hittades inte'); });
    return () => { cancelled = true; };
  }, [applicationId, loading]);

  const closeDetail = () => {
    setSelectedApp(null);
    if (applicationId) navigate('/applications', { replace: true });
  };
  const allUsers = currentUser ? store.getUsers() : [];
  const allFacilities = currentUser ? store.getFacilities() : [];

  let applications = currentUser ? store.getApplications() : [];

  if (currentUser && !roles.includes('administrator')) {
    const visibleIds = new Set<string>();
    if (roles.includes('employee') || roles.includes('contractor')) {
      applications.filter(a => a.applicant_id === currentUser.id).forEach(a => visibleIds.add(a.id));
    }
    if (roles.includes('line_manager')) {
      const teamIds = getSubordinateIds(currentUser.id, allUsers);
      applications.filter(a => teamIds.includes(a.applicant_id)).forEach(a => visibleIds.add(a.id));
    }
    if (roles.includes('facility_owner') || roles.includes('facility_admin')) {
      const myFacilityIds = allFacilities.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id)).map(f => f.id);
      applications.filter(a => myFacilityIds.includes(a.facility_id)).forEach(a => visibleIds.add(a.id));
    }
    applications = applications.filter(a => visibleIds.has(a.id));
  }

  const filtered = useMemo(() => {
    let result = applications;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a => {
        const user = allUsers.find(u => u.id === a.applicant_id);
        const fac = allFacilities.find(f => f.id === a.facility_id);
        return (user?.full_name || '').toLowerCase().includes(q) || (fac?.name || '').toLowerCase().includes(q);
      });
    }
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }
    return result;
  }, [applications, search, statusFilter, allUsers, allFacilities]);

  // Server-side pagination in API mode; local mode keeps client-side filtering
  const apiMode = store.isApiMode();
  const [pagedApps, setPagedApps] = useState<Application[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!apiMode || loading || !currentUser || showActionable) return;
    let cancelled = false;
    store.fetchApplicationsPage({ page, limit: PAGE_SIZE, search, status: statusFilter })
      .then(r => { if (!cancelled) { setPagedApps(r.data); setServerTotal(r.total); } })
      .catch(() => { if (!cancelled) toast.error('Kunde inte hämta ansökningar'); });
    return () => { cancelled = true; };
  }, [apiMode, loading, currentUser, page, search, statusFilter, refreshTick, showActionable]);

  const reloadPaged = useCallback(async () => {
    await reload();
    setRefreshTick(t => t + 1);
  }, [reload]);

  if (!currentUser) return null;
  const q = search.trim().toLowerCase();
  const actionableShown = actionable.filter(a => !q
    || (store.getUser(a.applicant_id)?.full_name || '').toLowerCase().includes(q)
    || (store.getFacility(a.facility_id)?.name || '').toLowerCase().includes(q));
  const clientList = showActionable ? actionableShown : filtered;
  const useServer = apiMode && !showActionable;
  const displayTotal = useServer ? serverTotal : clientList.length;
  const totalPages = Math.max(1, Math.ceil(displayTotal / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useServer ? pagedApps : clientList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const canCreateApplication = roles.includes('employee') || roles.includes('contractor');

  const handleDelete = async (app: Application) => {
    if (!confirm('Är du säker på att du vill ta bort denna ansökan?')) return;
    try {
      await store.deleteApplication(app.id);
      toast.success('Ansökan borttagen');
      closeDetail();
      reloadPaged();
    } catch (err) {
      toast.error(errorMessage(err, 'Kunde inte ta bort ansökan'));
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ansökningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera tillträdesansökningar ({displayTotal} st)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => { exportApplications(); toast.success('Ansökningar exporterade'); }}>
            <Download className="mr-2 h-4 w-4" />Exportera
          </Button>
          {canCreateApplication && (
            <Button onClick={() => { setEditApp(null); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Ny ansökan
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök sökande, anläggning..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {actionable.length > 0 || showActionable
              ? <SelectItem value="actionable">Att hantera ({actionable.length})</SelectItem>
              : null}
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <ApplicationTable applications={paged} onRowClick={setSelectedApp} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Visar {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, displayTotal)} av {displayTotal}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Föregående sida" title="Föregående sida" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Sida {safePage} av {totalPages}</span>
            <Button variant="outline" size="icon" aria-label="Nästa sida" title="Nästa sida" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ApplicationFormDialog open={formOpen} onOpenChange={setFormOpen} editApplication={editApp} onSaved={reloadPaged} />
      <ApplicationDetailDialog
        application={selectedApp}
        open={!!selectedApp}
        onOpenChange={(open) => { if (!open) closeDetail(); }}
        onUpdated={reloadPaged}
        onEdit={(app) => { closeDetail(); setEditApp(app); setFormOpen(true); }}
        onDelete={handleDelete}
      />
    </div>
  );
}
