import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Shield, CheckCircle, XCircle, Clock, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { currentUser, changePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');

  if (!currentUser) return null;

  const requirements = store.getRequirements();
  const userReqs = store.getUserRequirements(currentUser.id);
  const fulfilledCount = userReqs.filter(ur => ur.status === 'fulfilled').length;
  const progress = requirements.length > 0 ? Math.round((fulfilledCount / requirements.length) * 100) : 0;

  const manager = currentUser.manager_id ? store.getUser(currentUser.manager_id) : null;

  const handleChangePassword = () => {
    setPwError('');
    if (newPassword !== confirmPassword) { setPwError('Lösenorden matchar inte'); return; }
    const result = changePassword(newPassword);
    if (result.success) {
      toast.success('Lösenordet har ändrats');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPwError(result.error || 'Kunde inte byta lösenord');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Min profil</h1>
        <p className="text-sm text-muted-foreground mt-1">Dina uppgifter och kravuppfyllnad</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal info */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Uppgifter</CardTitle></CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        {/* Change password */}
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

      {/* Requirements */}
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
                      {fulfilled ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
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
