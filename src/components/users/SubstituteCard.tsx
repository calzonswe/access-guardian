import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as api from '@/services/api';
import * as store from '@/services/dataStore';
import { errorMessage } from '@/lib/utils';
import { isoDay } from '@/lib/applicationRules';
import type { User } from '@/types/rbac';

const NONE = '__none__';

/** "Ersättare vid frånvaro" on the profile page of a line manager. */
export function SubstituteCard({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [candidates, setCandidates] = useState<{ id: string; full_name: string }[]>([]);
  const [substituteId, setSubstituteId] = useState(user.substitute_id || NONE);
  const [from, setFrom] = useState((user.substitute_from || '').slice(0, 10));
  const [to, setTo] = useState((user.substitute_to || '').slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store.isApiMode()) return;
    api.getManagerCandidates()
      .then(list => setCandidates(list.filter(c => c.id !== user.id)))
      .catch(() => toast.error('Kunde inte hämta linjechefer'));
  }, [user.id]);

  const today = isoDay(new Date());
  const activeNow = user.substitute_id
    && (!user.substitute_from || user.substitute_from.slice(0, 10) <= today)
    && (!user.substitute_to || user.substitute_to.slice(0, 10) >= today);
  const activeName = candidates.find(c => c.id === user.substitute_id)?.full_name;

  const save = async (clear = false) => {
    if (!clear && substituteId !== NONE && from && to && to < from) {
      toast.error('Slutdatum kan inte vara före startdatum'); return;
    }
    setSaving(true);
    try {
      await store.updateOwnProfile(user.id, clear || substituteId === NONE
        ? { substitute_id: null, substitute_from: null, substitute_to: null }
        : { substitute_id: substituteId, substitute_from: from || null, substitute_to: to || null });
      if (clear) { setSubstituteId(NONE); setFrom(''); setTo(''); }
      toast.success(clear ? 'Ersättaren är borttagen' : 'Ersättare sparad');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Kunde inte spara ersättare'));
    } finally {
      setSaving(false);
    }
  };

  if (!store.isApiMode()) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><UserCheck className="h-4 w-4" />Ersättare vid frånvaro</CardTitle>
        <CardDescription>Ersättaren kan attestera ansökningar från dina medarbetare under perioden.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeNow && (
          <p className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm text-info">
            {activeName ?? 'Din ersättare'} är aktiv ersättare just nu{user.substitute_to ? ` till och med ${user.substitute_to.slice(0, 10)}` : ''}.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="substitute-select">Ersättare</Label>
          <Select value={substituteId} onValueChange={setSubstituteId}>
            <SelectTrigger id="substitute-select"><SelectValue placeholder="Välj linjechef" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ingen ersättare</SelectItem>
              {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="substitute-from">Från (valfritt)</Label><Input id="substitute-from" type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={substituteId === NONE} /></div>
          <div className="space-y-2"><Label htmlFor="substitute-to">Till och med (valfritt)</Label><Input id="substitute-to" type="date" value={to} onChange={e => setTo(e.target.value)} disabled={substituteId === NONE} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save()} disabled={saving}>Spara ersättare</Button>
          {user.substitute_id && <Button variant="outline" onClick={() => save(true)} disabled={saving}>Ta bort ersättare</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
