import { useState, useMemo } from 'react';
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
  const [formOpen, setFormOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const reload = () => setRefresh(n => n + 1);
  const roles = currentUser?.roles ?? [];
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

  if (!currentUser) return null;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const canCreateApplication = roles.includes('employee') || roles.includes('contractor');

  const handleDelete = (app: Application) => {
    if (confirm('Är du säker på att du vill ta bort denna ansökan?')) {
      store.deleteApplication(app.id);
      store.addLog({ action: 'application_denied', actor_id: currentUser.id, target_id: app.id, target_type: 'application', details: 'Ansökan borttagen' });
      setSelectedApp(null);
      reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ansökningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera tillträdesansökningar ({filtered.length} st)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { exportApplications(); toast.success('Ansökningar exporterade'); }}>
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
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <ApplicationTable applications={paged} onRowClick={setSelectedApp} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Visar {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} av {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Sida {safePage} av {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ApplicationFormDialog open={formOpen} onOpenChange={setFormOpen} editApplication={editApp} onSaved={reload} />
      <ApplicationDetailDialog
        application={selectedApp}
        open={!!selectedApp}
        onOpenChange={(open) => { if (!open) setSelectedApp(null); }}
        onUpdated={reload}
        onEdit={(app) => { setSelectedApp(null); setEditApp(app); setFormOpen(true); }}
        onDelete={handleDelete}
      />
    </div>
  );
}
