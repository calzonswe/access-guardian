import { useState } from 'react';
import { Building2, MapPin, Plus, Pencil, Trash2, Shield, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Facility } from '@/types/rbac';

export default function FacilitiesPage() {
  const { currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqFacilityId, setReqFacilityId] = useState<string | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminFacilityId, setAdminFacilityId] = useState<string | null>(null);
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set());
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
  const allRequirements = store.getRequirements();

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
      store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: editFacility.id, target_type: 'facility', details: `Anläggning uppdaterad: ${name}` });
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
      store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: f.id, target_type: 'facility', details: `Anläggning borttagen: ${f.name}` });
      toast.success('Anläggning borttagen');
      reload();
    }
  };

  const openReqDialog = (facilityId: string) => {
    setReqFacilityId(facilityId);
    setReqDialogOpen(true);
  };

  const toggleFacilityReq = (facilityId: string, requirementId: string, checked: boolean) => {
    if (checked) {
      store.addFacilityRequirement(facilityId, requirementId);
    } else {
      store.removeFacilityRequirement(facilityId, requirementId);
    }
    reload();
  };

  const toggleExpandReqs = (facilityId: string) => {
    setExpandedReqs(prev => {
      const next = new Set(prev);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
  };

  // Admin assignment
  const openAdminDialog = (facilityId: string) => {
    setAdminFacilityId(facilityId);
    setAdminDialogOpen(true);
  };

  const toggleFacilityAdmin = (facilityId: string, userId: string, checked: boolean) => {
    const facility = store.getFacility(facilityId);
    if (!facility) return;
    const currentAdmins = facility.admin_ids || [];
    const newAdmins = checked
      ? [...currentAdmins, userId]
      : currentAdmins.filter(id => id !== userId);
    store.updateFacility(facilityId, { admin_ids: newAdmins });
    store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: facilityId, target_type: 'facility', details: `Administratörer uppdaterade för ${facility.name}` });
    reload();
  };

  const facilityAdminCandidates = users.filter(u =>
    u.roles.includes('facility_admin') || u.roles.includes('administrator')
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Anläggningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera anläggningar, områden och krav</p>
        </div>
        {(currentUser.roles.includes('administrator') || currentUser.roles.includes('facility_owner')) && (
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
            const facilityReqs = store.getFacilityRequirements(facility.id);
            const reqNames = facilityReqs
              .map(fr => allRequirements.find(r => r.id === fr.requirement_id))
              .filter(Boolean);
            const showReqs = expandedReqs.has(facility.id);
            const admins = (facility.admin_ids || []).map(id => users.find(u => u.id === id)).filter(Boolean);

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
                    {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id) && (
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

                  {/* Admins */}
                  <div className="text-xs text-muted-foreground">
                    <span>Administratörer: </span>
                    {admins.length > 0 ? (
                      <span className="font-medium text-foreground">{admins.map(a => a!.full_name).join(', ')}</span>
                    ) : (
                      <span>Inga</span>
                    )}
                    {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id) && (
                      <Button variant="ghost" size="sm" className="text-xs h-5 ml-1 px-1" onClick={() => openAdminDialog(facility.id)}>
                        <Users className="h-3 w-3 mr-0.5" />Hantera
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {facilityAreas.map(area => (
                      <Badge key={area.id} variant="outline" className="text-xs">{area.name}</Badge>
                    ))}
                    {facilityAreas.length === 0 && <span className="text-xs text-muted-foreground">Inga områden</span>}
                  </div>

                  {/* Facility requirements section */}
                  <div className="border-t border-border pt-3 mt-3">
                    <button
                      onClick={() => toggleExpandReqs(facility.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <Shield className="h-3 w-3" />
                      <span>Krav ({reqNames.length})</span>
                      {showReqs ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>
                    {showReqs && (
                      <div className="mt-2 space-y-1">
                        {reqNames.length === 0 ? (
                          <p className="text-xs text-muted-foreground/70">Inga krav kopplade</p>
                        ) : (
                          reqNames.map(r => r && (
                            <Badge key={r.id} variant="secondary" className="text-xs mr-1">
                              {r.name}
                            </Badge>
                          ))
                        )}
                        {(currentUser.roles.includes('administrator') || currentUser.roles.includes('facility_owner') || currentUser.roles.includes('facility_admin')) && (
                          <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => openReqDialog(facility.id)}>
                            <Pencil className="h-3 w-3 mr-1" />Hantera krav
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Facility Dialog */}
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

      {/* Facility Requirements Dialog */}
      <Dialog open={reqDialogOpen} onOpenChange={setReqDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hantera krav för anläggning</DialogTitle>
          </DialogHeader>
          {reqFacilityId && (
            <div className="space-y-3">
              {allRequirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga krav har skapats ännu. Gå till Krav-sidan för att skapa krav.</p>
              ) : (
                allRequirements.map(req => {
                  const isLinked = store.getFacilityRequirements(reqFacilityId).some(fr => fr.requirement_id === req.id);
                  return (
                    <div key={req.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={(checked) => toggleFacilityReq(reqFacilityId, req.id, !!checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{req.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{req.description}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {req.type === 'training' ? 'Utbildning' : req.type === 'certification' ? 'Certifiering' : 'Säkerhetsprövning'}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReqDialogOpen(false)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facility Admin Assignment Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tilldela administratörer</DialogTitle>
          </DialogHeader>
          {adminFacilityId && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Välj vilka användare med rollen Anläggningsadministratör som ska administrera denna anläggning.
              </p>
              {facilityAdminCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga användare med rollen Anläggningsadministratör finns. Tilldela rollen först under Användare.</p>
              ) : (
                facilityAdminCandidates.map(user => {
                  const facility = store.getFacility(adminFacilityId);
                  const isAssigned = (facility?.admin_ids || []).includes(user.id);
                  return (
                    <div key={user.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                      <Checkbox
                        checked={isAssigned}
                        onCheckedChange={(checked) => toggleFacilityAdmin(adminFacilityId, user.id, !!checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex gap-1">
                        {user.roles.map(r => (
                          <Badge key={r} variant="secondary" className="text-[10px]">
                            {r === 'facility_admin' ? 'Admin' : r === 'administrator' ? 'Superadmin' : r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAdminDialogOpen(false)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
