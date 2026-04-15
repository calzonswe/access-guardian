import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Shield, CheckCircle, XCircle, Clock, Lock, Pencil, Save, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { currentUser, changePassword, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');

  if (!currentUser) return null;

  const requirements = store.getRequirements();
  const userReqs = store.getUserRequirements(currentUser.id);
  const fulfilledCount = userReqs.filter(ur => ur.status === 'fulfilled').length;
  const progress = requirements.length > 0 ? Math.round((fulfilledCount / requirements.length) * 100) : 0;

  const manager = currentUser.manager_id ? store.getUser(currentUser.manager_id) : null;

  const startEdit = () => {
    setEditFullName(currentUser.full_name);
    setEditPhone(currentUser.phone || '');
    setEditTitle(currentUser.title || '');
    setEditDepartment(currentUser.department || '');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editFullName.trim()) { toast.error('Namn krävs'); return; }
    setSaving(true);
    try {
      const parts = editFullName.trim().split(/\s+/);
      const first_name = parts[0] || '';
      const last_name = parts.slice(1).join(' ') || '';
      await store.updateUser(currentUser.id, {
        full_name: editFullName.trim(),
        first_name,
        last_name,
        phone: editPhone.trim() || undefined,
        title: editTitle.trim() || undefined,
        department: editDepartment.trim() || undefined,
      });
      refreshUser();
      setEditing(false);
      toast.success('Profil uppdaterad');
    } catch (err) {
      toast.error('Kunde inte spara profil');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPassword !== confirmPassword) { setPwError('Lösenorden matchar inte'); return; }
    if (newPassword.length < 8) { setPwError('Lösenordet måste vara minst 8 tecken'); return; }
    try {
      await changePassword(newPassword);
      toast.success('Lösenordet har ändrats');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError('Kunde inte byta lösenord');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Min profil</h1>
        <p className="text-sm text-muted-foreground mt-1">Dina uppgifter och kravuppfyllnad</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Uppgifter</CardTitle>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={startEdit}>
                  <Pencil className="mr-2 h-4 w-4" />Redigera
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Namn</Label>
                  <Input value={editFullName} onChange={e => setEditFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Befattning</Label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Organisation / Enhet</Label>
                  <Input value={editDepartment} onChange={e => setEditDepartment(e.target.value)} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-muted-foreground">Namn</span>
                  <span className="font-medium text-foreground">{currentUser.full_name}</span>
                  <span className="text-muted-foreground">E-post</span>
                  <span className="font-medium text-foreground">{currentUser.email}</span>
                  {currentUser.phone && (<>
                    <span className="text-muted-foreground">Telefon</span>
                    <span className="font-medium text-foreground">{currentUser.phone}</span>
                  </>)}
                  {currentUser.title && (<>
                    <span className="text-muted-foreground">Befattning</span>
                    <span className="font-medium text-foreground">{currentUser.title}</span>
                  </>)}
                  {currentUser.company && (<>
                    <span className="text-muted-foreground">Företag</span>
                    <span className="font-medium text-foreground">{currentUser.company}</span>
                  </>)}
                  {currentUser.department && (<>
                    <span className="text-muted-foreground">Organisation / Enhet</span>
                    <span className="font-medium text-foreground">{currentUser.department}</span>
                  </>)}
                  {manager && (<>
                    <span className="text-muted-foreground">Närmaste chef</span>
                    <span className="font-medium text-foreground">{manager.full_name}</span>
                  </>)}
                  <span className="text-muted-foreground">Roller</span>
                  <div className="flex flex-wrap gap-1">
                    {currentUser.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>)}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Lock className="h-4 w-4" />Byt lösenord</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nytt lösenord</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minst 8 tecken" />
            </div>
            <div className="space-y-2">
              <Label>Bekräfta lösenord</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            <Button onClick={handleChangePassword} disabled={!newPassword || !confirmPassword}>Byt lösenord</Button>
          </CardContent>
        </Card>
      </div>

      {requirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Kravuppfyllnad
              <Badge variant="outline" className="ml-auto">{fulfilledCount} / {requirements.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" />
            <div className="space-y-2">
              {requirements.map(req => {
                const ur = userReqs.find(u => u.requirement_id === req.id);
                const fulfilled = ur?.status === 'fulfilled';
                return (
                  <div key={req.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      {fulfilled ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">{req.name}</p>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      </div>
                    </div>
                    {fulfilled && ur?.expires_at && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Utgår {new Date(ur.expires_at).toLocaleDateString('sv-SE')}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
