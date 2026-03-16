import { useState } from 'react';
import { Building2, MapPin, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Facility } from '@/types/rbac';

export default function FacilitiesPage() {
  const { activeRole, currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [ownerId, setOwnerId] = useState('');

  if (!currentUser) return null;

  const facilities = store.getFacilities();
  const users = store.getUsers();
  const areas = store.getAreas();

  const openCreate = () => {
    setEditFacility(null);
    setName(''); setDescription(''); setAddress(''); setOwnerId(currentUser.id);
    setDialogOpen(true);
  };

  const openEdit = (f: Facility) => {
    setEditFacility(f);
    setName(f.name); setDescription(f.description); setAddress(f.address); setOwnerId(f.owner_id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Ange namn'); return; }
    if (editFacility) {
      store.updateFacility(editFacility.id, { name, description, address, owner_id: ownerId });
      store.addLog({ action: 'facility_created', actor_id: currentUser.id, target_id: editFacility.id, target_type: 'facility', details: `Anläggning uppdaterad: ${name}` });
      toast.success('Anläggning uppdaterad');
    } else {
      const f = store.createFacility({ name, description, address, owner_id: ownerId, admin_ids: [] });
      store.addLog({ action: 'facility_created', actor_id: currentUser.id, target_id: f.id, target_type: 'facility', details: `Ny anläggning skapad: ${name}` });
      toast.success('Anläggning skapad');
    }
    setDialogOpen(false);
    reload();
  };

  const handleDelete = (f: Facility) => {
    if (confirm(`Är du säker på att du vill ta bort "${f.name}" och alla dess områden?`)) {
      store.deleteFacility(f.id);
      store.addLog({ action: 'facility_created', actor_id: currentUser.id, target_id: f.id, target_type: 'facility', details: `Anläggning borttagen: ${f.name}` });
      toast.success('Anläggning borttagen');
      reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Anläggningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera anläggningar och områden</p>
        </div>
        {(activeRole === 'administrator' || activeRole === 'facility_owner') && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Ny anläggning</Button>
        )}
      </div>

      {facilities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Inga anläggningar</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Skapa din första anläggning för att komma igång</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {facilities.map(facility => {
            const facilityAreas = areas.filter(a => a.facility_id === facility.id);
            const owner = users.find(u => u.id === facility.owner_id);
            return (
              <Card key={facility.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{facility.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{facility.description}</p>
                      </div>
                    </div>
                    {(activeRole === 'administrator' || facility.owner_id === currentUser.id) && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(facility)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(facility)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{facility.address}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Ägare: <span className="font-medium text-foreground">{owner?.full_name ?? '–'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {facilityAreas.map(area => (
                      <Badge key={area.id} variant="outline" className="text-xs">{area.name}</Badge>
                    ))}
                    {facilityAreas.length === 0 && <span className="text-xs text-muted-foreground">Inga områden</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editFacility ? 'Redigera anläggning' : 'Ny anläggning'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Namn</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Anläggningsnamn" />
            </div>
            <div className="space-y-2">
              <Label>Beskrivning</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Beskrivning" />
            </div>
            <div className="space-y-2">
              <Label>Adress</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Gatuadress, Stad" />
            </div>
            <div className="space-y-2">
              <Label>Ägare</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Välj ägare" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave}>{editFacility ? 'Spara' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
