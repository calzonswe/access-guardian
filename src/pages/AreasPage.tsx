import { useState } from 'react';
import { MapPin, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Area } from '@/types/rbac';

const SECURITY_COLORS: Record<string, string> = {
  low: 'bg-success/10 text-success border-success/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  critical: 'bg-destructive text-destructive-foreground',
};
const SECURITY_LABELS: Record<string, string> = { low: 'Låg', medium: 'Medel', high: 'Hög', critical: 'Kritisk' };

export default function AreasPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editArea, setEditArea] = useState<Area | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  const [facilityId, setFacilityId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [securityLevel, setSecurityLevel] = useState<Area['security_level']>('medium');

  if (!currentUser) return null;

  const facilities = store.getFacilities();
  const allAreas = store.getAreas();

  const openCreate = () => {
    setEditArea(null);
    setFacilityId(facilities[0]?.id || ''); setName(''); setDescription(''); setSecurityLevel('medium');
    setDialogOpen(true);
  };

  const openEdit = (a: Area) => {
    setEditArea(a);
    setFacilityId(a.facility_id); setName(a.name); setDescription(a.description); setSecurityLevel(a.security_level);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !facilityId) { toast.error('Fyll i alla fält'); return; }
    if (editArea) {
      store.updateArea(editArea.id, { facility_id: facilityId, name, description, security_level: securityLevel });
      toast.success('Område uppdaterat');
    } else {
      store.createArea({ facility_id: facilityId, name, description, security_level: securityLevel });
      store.addLog({ action: 'area_created', actor_id: currentUser.id, details: `Nytt område skapat: ${name}` });
      toast.success('Område skapat');
    }
    setDialogOpen(false); reload();
  };

  const handleDelete = (a: Area) => {
    if (confirm(`Ta bort "${a.name}"?`)) {
      store.deleteArea(a.id);
      toast.success('Område borttaget'); reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Områden</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera områden inom anläggningar</p>
        </div>
        {(activeRole === 'administrator' || activeRole === 'facility_owner' || activeRole === 'facility_admin') && (
          <Button onClick={openCreate} disabled={facilities.length === 0}><Plus className="mr-2 h-4 w-4" />Nytt område</Button>
        )}
      </div>

      {facilities.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Skapa en anläggning först</CardContent></Card>
      ) : (
        facilities.map(facility => {
          const areas = allAreas.filter(a => a.facility_id === facility.id);
          return (
            <Card key={facility.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />{facility.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {areas.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">Inga områden i denna anläggning</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Område</TableHead>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead>Säkerhetsnivå</TableHead>
                        <TableHead>Skapad</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {areas.map(area => (
                        <TableRow key={area.id}>
                          <TableCell className="font-medium">{area.name}</TableCell>
                          <TableCell className="text-muted-foreground">{area.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={SECURITY_COLORS[area.security_level]}>
                              {SECURITY_LABELS[area.security_level]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{new Date(area.created_at).toLocaleDateString('sv-SE')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(area)}><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(area)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editArea ? 'Redigera område' : 'Nytt område'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Anläggning</Label>
              <Select value={facilityId} onValueChange={setFacilityId} disabled={!!editArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Namn</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Beskrivning</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Säkerhetsnivå</Label>
              <Select value={securityLevel} onValueChange={v => setSecurityLevel(v as Area['security_level'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Låg</SelectItem>
                  <SelectItem value="medium">Medel</SelectItem>
                  <SelectItem value="high">Hög</SelectItem>
                  <SelectItem value="critical">Kritisk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave}>{editArea ? 'Spara' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
