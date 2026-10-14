import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Shield, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABELS, type AppRole } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { User } from '@/types/rbac';
import UserFormDialog from '@/components/users/UserFormDialog';
import UserRequirementDialog from '@/components/users/UserRequirementDialog';
import { exportUsers, exportRequirementsFulfillment } from '@/services/exportService';
import { useDataRefresh } from '@/hooks/useDataRefresh';

const PAGE_SIZE = 10;
const ALL_ROLES_FILTER: AppRole[] = ['administrator', 'facility_owner', 'facility_admin', 'line_manager', 'employee', 'contractor'];

export default function UsersPage() {
  const { currentUser } = useAuth();
  const { loading, reload } = useDataRefresh();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqTargetUser, setReqTargetUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const users = currentUser ? store.getUsers() : [];

  // Server-side pagination (API mode) with local fallback via dataStore
  const [paged, setPaged] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (loading || !currentUser) return;
    let cancelled = false;
    store.fetchUsersPage({ page, limit: PAGE_SIZE, search, role: roleFilter, status: statusFilter })
      .then(r => { if (!cancelled) { setPaged(r.data); setTotal(r.total); } })
      .catch(() => { if (!cancelled) toast.error('Kunde inte hämta användare'); });
    return () => { cancelled = true; };
  }, [loading, currentUser, page, search, roleFilter, statusFilter, refreshTick]);

  const reloadPaged = useCallback(async () => {
    await reload();
    setRefreshTick(t => t + 1);
  }, [reload]);

  if (!currentUser) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const openCreate = () => { setEditUser(null); setDialogOpen(true); };
  const openEdit = (u: User) => { setEditUser(u); setDialogOpen(true); };
  const openReqDialog = (u: User) => { setReqTargetUser(u); setReqDialogOpen(true); };

  const handleDelete = async (u: User) => {
    if (u.id === currentUser.id) { toast.error('Du kan inte ta bort dig själv'); return; }
    if (confirm(`Ta bort "${u.full_name}"?`)) {
      await store.deleteUser(u.id);
      toast.success('Användare borttagen'); reloadPaged();
    }
  };

  const handleToggleActive = async (u: User) => {
    await store.updateUser(u.id, { is_active: !u.is_active });
    toast.success(u.is_active ? 'Användare inaktiverad' : 'Användare aktiverad');
    reloadPaged();
  };

  const canManageRequirements = currentUser.roles.includes('administrator') ||
    currentUser.roles.includes('line_manager') ||
    currentUser.roles.includes('facility_admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Användare</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera användare och roller ({total} st)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { exportUsers(); toast.success('Användare exporterade'); }}>
            <Download className="mr-2 h-4 w-4" />Exportera
          </Button>
          <Button variant="outline" size="sm" onClick={() => { exportRequirementsFulfillment(); toast.success('Kravuppfyllnad exporterad'); }}>
            <Download className="mr-2 h-4 w-4" />Kravrapport
          </Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ny användare</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök namn, e-post, företag..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alla roller" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla roller</SelectItem>
            {ALL_ROLES_FILTER.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Alla" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla</SelectItem>
            <SelectItem value="active">Aktiva</SelectItem>
            <SelectItem value="inactive">Inaktiva</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {paged.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">Inga användare matchar filtret</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead>Befattning</TableHead>
                  <TableHead>Företag / Enhet</TableHead>
                  <TableHead>Roller</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell className="text-muted-foreground">{user.title || '–'}</TableCell>
                    <TableCell className="text-muted-foreground">{user.company || user.department || '–'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`cursor-pointer ${user.is_active ? 'status-badge-approved' : 'status-badge-denied'}`} onClick={() => handleToggleActive(user)}>
                        {user.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {canManageRequirements && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Kravuppfyllnad" onClick={() => openReqDialog(user)}>
                            <Shield className="h-3 w-3 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(user)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(user)} disabled={user.id === currentUser.id}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      <UserFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editUser={editUser} users={users} currentUserId={currentUser.id} onSaved={reload} />
      <UserRequirementDialog open={reqDialogOpen} onOpenChange={setReqDialogOpen} targetUser={reqTargetUser} onUpdated={reload} />
    </div>
  );
}
