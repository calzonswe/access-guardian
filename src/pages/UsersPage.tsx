import { useState } from 'react';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABELS, type AppRole } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { User } from '@/types/rbac';
import UserFormDialog from '@/components/users/UserFormDialog';
import UserRequirementDialog from '@/components/users/UserRequirementDialog';

export default function UsersPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqTargetUser, setReqTargetUser] = useState<User | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  if (!currentUser) return null;
  const users = store.getUsers();

  const openCreate = () => { setEditUser(null); setDialogOpen(true); };
  const openEdit = (u: User) => { setEditUser(u); setDialogOpen(true); };

  const openReqDialog = (u: User) => { setReqTargetUser(u); setReqDialogOpen(true); };

  const handleDelete = (u: User) => {
    if (u.id === currentUser.id) { toast.error('Du kan inte ta bort dig själv'); return; }
    if (confirm(`Ta bort "${u.full_name}"?`)) {
      store.deleteUser(u.id);
      toast.success('Användare borttagen'); reload();
    }
  };

  const handleToggleActive = async (u: User) => {
    await store.updateUser(u.id, { is_active: !u.is_active });
    toast.success(u.is_active ? 'Användare inaktiverad' : 'Användare aktiverad');
    reload();
  };

  const canManageRequirements = currentUser.roles.includes('administrator') ||
    currentUser.roles.includes('line_manager') ||
    currentUser.roles.includes('facility_admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Användare</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera användare och roller</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ny användare</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">Inga användare</div>
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
                {users.map(user => (
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
                      <Badge variant="outline" className={user.is_active ? 'status-badge-approved' : 'status-badge-denied'} onClick={() => handleToggleActive(user)} style={{ cursor: 'pointer' }}>
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

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editUser={editUser}
        users={users}
        currentUserId={currentUser.id}
        onSaved={reload}
      />

      <UserRequirementDialog
        open={reqDialogOpen}
        onOpenChange={setReqDialogOpen}
        targetUser={reqTargetUser}
        onUpdated={reload}
      />
    </div>
  );
}
