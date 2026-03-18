import { useState } from 'react';
import { Shield, Plus, Clock, Award, Lock, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Requirement } from '@/types/rbac';

const TYPE_LABELS: Record<string, string> = { certification: 'Certifiering', clearance: 'Säkerhetsprövning', training: 'Utbildning' };
const TYPE_ICONS: Record<string, typeof Award> = { certification: Award, clearance: Lock, training: Shield };

export default function RequirementsPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReq, setEditReq] = useState<Requirement | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Requirement['type']>('training');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [validityDays, setValidityDays] = useState(365);

  if (!currentUser) return null;

  const requirements = store.getRequirements();

  const openCreate = () => {
    setEditReq(null); setName(''); setDescription(''); setType('training'); setHasExpiry(false); setValidityDays(365);
    setDialogOpen(true);
  };

  const openEdit = (r: Requirement) => {
    setEditReq(r); setName(r.name); setDescription(r.description); setType(r.type); setHasExpiry(r.has_expiry); setValidityDays(r.validity_days || 365);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Ange namn'); return; }
    if (editReq) {
      store.updateRequirement(editReq.id, { name, description, type, has_expiry: hasExpiry, validity_days: hasExpiry ? validityDays : undefined });
      toast.success('Krav uppdaterat');
    } else {
      store.createRequirement({ name, description, type, has_expiry: hasExpiry, validity_days: hasExpiry ? validityDays : undefined });
      store.addLog({ action: 'requirement_created', actor_id: currentUser.id, details: `Nytt krav skapat: ${name}` });
      toast.success('Krav skapat');
    }
    setDialogOpen(false); reload();
  };

  const handleDelete = (r: Requirement) => {
    if (confirm(`Ta bort "${r.name}"?`)) {
      store.deleteRequirement(r.id);
      toast.success('Krav borttaget'); reload();
    }
  };

  const canEdit = activeRole === 'administrator' || activeRole === 'facility_owner' || activeRole === 'facility_admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Krav</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera certifieringar, utbildningar och säkerhetsprövningar</p>
        </div>
        {canEdit && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nytt krav</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {requirements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Inga krav definierade</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Skapa krav som utbildningar och certifieringar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Krav</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Beskrivning</TableHead>
                  <TableHead>Giltighetstid</TableHead>
                  {canEdit && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map(req => {
                  const Icon = TYPE_ICONS[req.type] || Shield;
                  return (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium">{req.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{TYPE_LABELS[req.type]}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{req.description}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {req.has_expiry ? (
                          <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.validity_days} dagar</div>
                        ) : (
                          <span className="text-success">Permanent</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(req)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(req)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editReq ? 'Redigera krav' : 'Nytt krav'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Namn</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Beskrivning</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={type} onValueChange={v => setType(v as Requirement['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Utbildning</SelectItem>
                  <SelectItem value="certification">Certifiering</SelectItem>
                  <SelectItem value="clearance">Säkerhetsprövning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Har giltighetstid</Label>
              <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
            </div>
            {hasExpiry && (
              <div className="space-y-2">
                <Label>Giltighetstid (dagar)</Label>
                <Input type="number" value={validityDays} onChange={e => setValidityDays(parseInt(e.target.value) || 0)} min={1} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave}>{editReq ? 'Spara' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
