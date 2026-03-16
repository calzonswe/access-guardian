import { useState } from 'react';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ROLE_LABELS, type AppRole } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { User } from '@/types/rbac';

const ALL_ROLES: AppRole[] = ['administrator', 'facility_owner', 'facility_admin', 'line_manager', 'employee', 'contractor'];

export default function UsersPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<AppRole[]>(['employee']);
  const [department, setDepartment] = useState('');
  const [company, setCompany] = useState('');
  const [managerId, setManagerId] = useState('');
  const [contactPersonId, setContactPersonId] = useState('');

  if (!currentUser) return null;
  const users = store.getUsers();

  const openCreate = () => {
    setEditUser(null);
    setFullName(''); setEmail(''); setPassword(''); setRoles(['employee']);
    setDepartment(''); setCompany(''); setManagerId(''); setContactPersonId('');
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setFullName(u.full_name); setEmail(u.email); setPassword(''); setRoles([...u.roles]);
    setDepartment(u.department || ''); setCompany(u.company || '');
    setManagerId(u.manager_id || ''); setContactPersonId(u.contact_person_id || '');
    setDialogOpen(true);
  };

  const toggleRole = (role: AppRole) => {
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleSave = () => {
    if (!fullName.trim() || !email.trim()) { toast.error('Namn och e-post krävs'); return; }
    if (!editUser && !password.trim()) { toast.error('Lösenord krävs för nya användare'); return; }
    if (roles.length === 0) { toast.error('Välj minst en roll'); return; }

    // Check unique email
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== editUser?.id);
    if (existing) { toast.error('E-postadressen används redan'); return; }

    if (editUser) {
      const updateData: any = { full_name: fullName, email, roles, department: department || undefined, company: company || undefined, manager_id: managerId || undefined, contact_person_id: contactPersonId || undefined };
      if (password.trim()) { updateData.password = password; updateData.must_change_password = true; }
      store.updateUser(editUser.id, updateData);
      store.addLog({ action: 'user_updated', actor_id: currentUser.id, target_id: editUser.id, target_type: 'user', details: `Användare uppdaterad: ${fullName}` });
      toast.success('Användare uppdaterad');
    } else {
      const u = store.createUser({
        full_name: fullName, email, roles, department: department || undefined,
        company: company || undefined, manager_id: managerId || undefined,
        contact_person_id: contactPersonId || undefined, is_active: true, password,
      });
      store.addLog({ action: 'user_created', actor_id: currentUser.id, target_id: u.id, target_type: 'user', details: `Ny användare skapad: ${fullName}` });
      toast.success(`Användare skapad. Inloggning: ${email} / ${password}`);
    }
    setDialogOpen(false); reload();
  };

  const handleDelete = (u: User) => {
    if (u.id === currentUser.id) { toast.error('Du kan inte ta bort dig själv'); return; }
    if (confirm(`Ta bort "${u.full_name}"?`)) {
      store.deleteUser(u.id);
      toast.success('Användare borttagen'); reload();
    }
  };

  const handleToggleActive = (u: User) => {
    store.updateUser(u.id, { is_active: !u.is_active });
    toast.success(u.is_active ? 'Användare inaktiverad' : 'Användare aktiverad');
    reload();
  };

  const isContractor = roles.includes('contractor');
  const isEmployee = roles.includes('employee');

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
                  <TableHead>Roller</TableHead>
                  <TableHead>Avdelning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.department || user.company || '–'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={user.is_active ? 'status-badge-approved' : 'status-badge-denied'} onClick={() => handleToggleActive(user)} style={{ cursor: 'pointer' }}>
                        {user.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editUser ? 'Redigera användare' : 'Ny användare'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Namn</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
              <div className="space-y-2"><Label>E-post</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>{editUser ? 'Nytt lösenord (lämna tomt för att behålla)' : 'Lösenord'}</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editUser ? '••••••••' : ''} />
            </div>
            <div className="space-y-2">
              <Label>Roller</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox checked={roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    <span className="text-sm">{ROLE_LABELS[role]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Avdelning</Label><Input value={department} onChange={e => setDepartment(e.target.value)} /></div>
              {isContractor && <div className="space-y-2"><Label>Företag</Label><Input value={company} onChange={e => setCompany(e.target.value)} /></div>}
            </div>
            {(isEmployee || isContractor) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {isEmployee && (
                  <div className="space-y-2">
                    <Label>Chef</Label>
                    <Select value={managerId} onValueChange={setManagerId}>
                      <SelectTrigger><SelectValue placeholder="Välj chef" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Ingen</SelectItem>
                        {users.filter(u => u.roles.includes('line_manager')).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isContractor && (
                  <div className="space-y-2">
                    <Label>Kontaktperson</Label>
                    <Select value={contactPersonId} onValueChange={setContactPersonId}>
                      <SelectTrigger><SelectValue placeholder="Välj kontaktperson" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Ingen</SelectItem>
                        {users.filter(u => !u.roles.includes('contractor')).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave}>{editUser ? 'Spara' : 'Skapa användare'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
