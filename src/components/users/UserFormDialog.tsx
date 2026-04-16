import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS, type AppRole, type User } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { toast } from 'sonner';

const ALL_ROLES: AppRole[] = ['administrator', 'facility_owner', 'facility_admin', 'line_manager', 'employee', 'contractor'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editUser: User | null;
  users: User[];
  currentUserId: string;
  onSaved: () => void;
}

export default function UserFormDialog({ open, onOpenChange, editUser, users, currentUserId, onSaved }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<AppRole[]>(['employee']);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [managerId, setManagerId] = useState('');
  const [contactPersonId, setContactPersonId] = useState('');

  useEffect(() => {
    if (open) {
      if (editUser) {
        setFirstName(editUser.first_name || '');
        setLastName(editUser.last_name || '');
        setEmail(editUser.email);
        setPhone(editUser.phone || '');
        setPassword('');
        setRoles([...editUser.roles]);
        setTitle(editUser.title || '');
        setCompany(editUser.company || '');
        setDepartment(editUser.department || '');
        setManagerId(editUser.manager_id || '');
        setContactPersonId(editUser.contact_person_id || '');
      } else {
        setFirstName(''); setLastName(''); setEmail(''); setPhone('');
        setPassword(''); setRoles(['employee']); setTitle('');
        setCompany(''); setDepartment(''); setManagerId(''); setContactPersonId('');
      }
    }
  }, [open, editUser]);

  const toggleRole = (role: AppRole) => {
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const isContractor = roles.includes('contractor');

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error('Förnamn och efternamn krävs'); return; }
    if (!email.trim()) { toast.error('E-post krävs'); return; }
    if (!editUser && !password.trim()) { toast.error('Lösenord krävs för nya användare'); return; }
    if (roles.length === 0) { toast.error('Välj minst en roll'); return; }
    if (isContractor && !contactPersonId) { toast.error('Kontaktperson krävs för entreprenörer'); return; }

    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== editUser?.id);
    if (existing) { toast.error('E-postadressen används redan'); return; }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    if (editUser) {
      const updateData: any = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        email,
        roles,
        title: title || undefined,
        phone: phone || undefined,
        company: company || undefined,
        department: department || undefined,
        manager_id: managerId || undefined,
        contact_person_id: isContractor ? contactPersonId || undefined : undefined,
      };
      if (password.trim()) { updateData.password = password; updateData.must_change_password = true; }
      await store.updateUser(editUser.id, updateData);
      store.addLog({ action: 'user_updated', actor_id: currentUserId, target_id: editUser.id, target_type: 'user', details: `Användare uppdaterad: ${fullName}` });
      toast.success('Användare uppdaterad');
    } else {
      const u = await store.createUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        email,
        roles,
        title: title || undefined,
        phone: phone || undefined,
        company: company || undefined,
        department: department || undefined,
        manager_id: managerId || undefined,
        contact_person_id: isContractor ? contactPersonId || undefined : undefined,
        is_active: true,
        password,
      });
      store.addLog({ action: 'user_created', actor_id: currentUserId, target_id: u.id, target_type: 'user', details: `Ny användare skapad: ${fullName}` });
      toast.success(`Användare skapad.`);
    }
    onOpenChange(false);
    onSaved();
  };

  const managers = users.filter(u => u.roles.includes('line_manager'));
  const internalContacts = users.filter(u => !u.roles.includes('contractor') && u.id !== editUser?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editUser ? 'Redigera användare' : 'Ny användare'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Förnamn *</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Anna" />
            </div>
            <div className="space-y-2">
              <Label>Efternamn *</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Andersson" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>E-post *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="anna@företag.se" />
            </div>
            <div className="space-y-2">
              <Label>Telefonnummer</Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+46 70 123 45 67" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{editUser ? 'Nytt lösenord (lämna tomt för att behålla)' : 'Lösenord *'}</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editUser ? '••••••••' : ''} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Befattning</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Projektledare" />
            </div>
            <div className="space-y-2">
              <Label>Företag</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Företaget AB" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Organisation / Enhet</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="t.ex. Drift" />
            </div>
            <div className="space-y-2">
              <Label>Närmaste chef</Label>
              <Select value={managerId || '__none__'} onValueChange={v => setManagerId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Välj chef" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen</SelectItem>
                  {managers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact person for contractors */}
          {isContractor && (
            <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
              <Label>Kontaktperson (intern sponsor) *</Label>
              <p className="text-xs text-muted-foreground mb-1">
                En intern anställd som ansvarar för entreprenören
              </p>
              <Select value={contactPersonId} onValueChange={setContactPersonId}>
                <SelectTrigger><SelectValue placeholder="Välj kontaktperson" /></SelectTrigger>
                <SelectContent>
                  {internalContacts.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name} – {u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave}>{editUser ? 'Spara' : 'Skapa användare'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
