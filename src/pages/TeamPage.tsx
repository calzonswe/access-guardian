import { useState } from 'react';
import { Users, Shield, CheckCircle, AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import type { User } from '@/types/rbac';
import UserFormDialog from '@/components/users/UserFormDialog';
import { toast } from 'sonner';

function getSubordinates(managerId: string, allUsers: User[]): User[] {
  const direct = allUsers.filter(u => u.manager_id === managerId || u.contact_person_id === managerId);
  const all = [...direct];
  for (const d of direct) {
    const subs = getSubordinates(d.id, allUsers);
    for (const s of subs) {
      if (!all.find(a => a.id === s.id)) all.push(s);
    }
  }
  return all;
}

export default function TeamPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  if (!currentUser) return null;

  const users = store.getUsers();
  const applications = store.getApplications();
  const requirements = store.getRequirements();
  const userRequirements = store.getUserRequirements();

  const teamMembers = getSubordinates(currentUser.id, users);
  const teamIds = teamMembers.map(u => u.id);
  const teamApps = applications.filter(a => teamIds.includes(a.applicant_id));
  const pendingApps = teamApps.filter(a => a.status === 'pending_manager');

  const openCreate = () => { setEditUser(null); setDialogOpen(true); };
  const openEdit = (u: User) => { setEditUser(u); setDialogOpen(true); };

  const handleDelete = (u: User) => {
    if (confirm(`Ta bort "${u.full_name}"?`)) {
      store.deleteUser(u.id);
      store.addLog({ action: 'user_updated', actor_id: currentUser.id, target_id: u.id, target_type: 'user', details: `Användare borttagen: ${u.full_name}` });
      toast.success('Användare borttagen');
      reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mitt team</h1>
          <p className="text-sm text-muted-foreground mt-1">Översikt av ditt teams tillträdesrättigheter</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ny anställd</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Teammedlemmar" value={teamMembers.length} icon={Users} variant="primary" />
        <StatCard title="Väntar på godkännande" value={pendingApps.length} icon={AlertTriangle} variant="warning" />
        <StatCard title="Aktiva tillträden" value={teamApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Teammedlemmar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead>Uppfyllda krav</TableHead>
                <TableHead>Aktiva tillträden</TableHead>
                <TableHead>Väntande ansökningar</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Inga teammedlemmar</TableCell></TableRow>
              ) : (
                teamMembers.map(member => {
                  const memberReqs = userRequirements.filter(ur => ur.user_id === member.id && ur.status === 'fulfilled');
                  const memberApps = applications.filter(a => a.applicant_id === member.id);
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name}</TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{member.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>)}</div></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" />{memberReqs.length} / {requirements.length}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={memberApps.filter(a => a.status === 'approved').length > 0 ? 'status-badge-approved' : ''}>{memberApps.filter(a => a.status === 'approved').length}</Badge></TableCell>
                      <TableCell>{memberApps.filter(a => a.status.startsWith('pending')).length > 0 ? <Badge variant="outline" className="status-badge-pending">{memberApps.filter(a => a.status.startsWith('pending')).length}</Badge> : <span className="text-muted-foreground text-sm">0</span>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(member)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(member)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editUser={editUser}
        users={users}
        currentUserId={currentUser.id}
        onSaved={reload}
      />
    </div>
  );
}
