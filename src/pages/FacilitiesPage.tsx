import { useState } from 'react';
import { Building2, MapPin, Plus, Pencil, Trash2, Shield, ShieldCheck, ChevronDown, ChevronUp, Users, Search } from 'lucide-react';
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
import * as api from '@/services/api';
import { errorMessage } from '@/lib/utils';
import { activeAccessFor } from '@/lib/applicationRules';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { Facility } from '@/types/rbac';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { t } from '@/i18n';

export default function FacilitiesPage() {
  const { currentUser } = useAuth();
  const { loading, reload } = useDataRefresh();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqFacilityId, setReqFacilityId] = useState<string | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminCandidates, setAdminCandidates] = useState<Awaited<ReturnType<typeof api.getFacilityAdminCandidates>>>([]);
  const [adminFacilityId, setAdminFacilityId] = useState<string | null>(null);
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');


  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [ownerId, setOwnerId] = useState('');

  if (!currentUser) return null;

  const allFacilities = store.getFacilities();
  const q = search.trim().toLowerCase();
  const facilities = q
    ? allFacilities.filter(f =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        (f.address || '').toLowerCase().includes(q))
    : allFacilities;

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

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('Ange namn')); return; }
    if (editFacility) {
      await store.updateFacility(editFacility.id, { name, description, address, owner_id: ownerId });
      await store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: editFacility.id, target_type: 'facility', details: t('Anläggning uppdaterad: {name}', { name }) });
      toast.success(t('Anläggning uppdaterad'));
    } else {
      const f = await store.createFacility({ name, description, address, owner_id: ownerId, admin_ids: [] });
      await store.addLog({ action: 'facility_created', actor_id: currentUser.id, target_id: f.id, target_type: 'facility', details: t('Ny anläggning skapad: {name}', { name }) });
      toast.success(t('Anläggning skapad'));
    }
    setDialogOpen(false);
    reload();
  };

  const handleDelete = async (f: Facility) => {
    if (confirm(t('Är du säker på att du vill ta bort "{name}" och alla dess områden?', { name: f.name }))) {
      await store.deleteFacility(f.id);
      await store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: f.id, target_type: 'facility', details: t('Anläggning borttagen: {name}', { name: f.name }) });
      toast.success(t('Anläggning borttagen'));
      reload();
    }
  };

  const openReqDialog = (facilityId: string) => {
    setReqFacilityId(facilityId);
    setReqDialogOpen(true);
  };

  const toggleFacilityReq = async (facilityId: string, requirementId: string, checked: boolean) => {
    if (checked) {
      await store.addFacilityRequirement(facilityId, requirementId);
    } else {
      await store.removeFacilityRequirement(facilityId, requirementId);
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

  const openAdminDialog = (facilityId: string) => {
    setAdminFacilityId(facilityId);
    setAdminDialogOpen(true);
    if (store.isApiMode() && !currentUser.roles.includes('administrator')) {
      api.getFacilityAdminCandidates()
        .then(setAdminCandidates)
        .catch(err => toast.error(errorMessage(err, t('Kunde inte hämta administratörer'))));
    }
  };

  const toggleFacilityAdmin = async (facilityId: string, userId: string, checked: boolean) => {
    const facility = store.getFacility(facilityId);
    if (!facility) return;
    const currentAdmins = facility.admin_ids || [];
    const newAdmins = checked
      ? [...currentAdmins, userId]
      : currentAdmins.filter(id => id !== userId);
    await store.updateFacility(facilityId, { admin_ids: newAdmins });
    await store.addLog({ action: 'settings_changed', actor_id: currentUser.id, target_id: facilityId, target_type: 'facility', details: t('Administratörer uppdaterade för {name}', { name: facility.name }) });
    reload();
  };

  // Administrators can list all users; facility owners get candidates from a
  // dedicated endpoint because their user list only contains their applicants.
  const facilityAdminCandidates = currentUser.roles.includes('administrator') || !store.isApiMode()
    ? users.filter(u => u.roles.includes('facility_admin') || u.roles.includes('administrator'))
    : adminCandidates;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('Anläggningar')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('Hantera anläggningar, områden och krav')}</p>
        </div>
        {currentUser.roles.includes('administrator') && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t('Ny anläggning')}</Button>
        )}
      </div>

      {allFacilities.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('Sök anläggning, adress...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {facilities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {q ? t('Inga anläggningar matchar sökningen') : t('Inga anläggningar')}
            </p>
            {!q && <p className="text-sm text-muted-foreground/70 mt-1">{t('Skapa din första anläggning för att komma igång')}</p>}
          </CardContent>
        </Card>
      ) : (

        <div className="grid gap-4 md:grid-cols-2">
          {facilities.map(facility => {
            const facilityAreas = areas.filter(a => a.facility_id === facility.id);
            const owner = users.find(u => u.id === facility.owner_id) ?? (facility.owner_name ? { full_name: facility.owner_name } : undefined);
            const facilityReqs = store.getFacilityRequirements(facility.id);
            const reqNames = facilityReqs
              .map(fr => allRequirements.find(r => r.id === fr.requirement_id))
              .filter(Boolean);
            const showReqs = expandedReqs.has(facility.id);
            const admins = (facility.admin_ids || []).map(id => users.find(u => u.id === id) ?? facility.admins?.find(a => a.id === id)).filter(Boolean);

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
                    {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id || (facility.admin_ids || []).includes(currentUser.id)) && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={t('Hantera områden')} className="h-8 w-8" title={t('Hantera områden')} asChild>
                          <Link to={`/facilities/${facility.id}/areas`}><MapPin className="h-3.5 w-3.5 text-primary" /></Link>
                        </Button>
                        {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id) && (
                          <Button variant="ghost" size="icon" aria-label={t('Redigera')} title={t('Redigera')} className="h-8 w-8" onClick={() => openEdit(facility)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {currentUser.roles.includes('administrator') && (
                          <Button variant="ghost" size="icon" aria-label={t('Ta bort')} title={t('Ta bort')} className="h-8 w-8" onClick={() => handleDelete(facility)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{facility.address}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('Ägare:')} <span className="font-medium text-foreground">{owner?.full_name ?? '–'}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span>{t('Administratörer:')} </span>
                    {admins.length > 0 ? (
                      <span className="font-medium text-foreground">{admins.map(a => a!.full_name).join(', ')}</span>
                    ) : (
                      <span>{t('Inga')}</span>
                    )}
                    {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id) && (
                      <Button variant="ghost" size="sm" className="text-xs h-5 ml-1 px-1" onClick={() => openAdminDialog(facility.id)}>
                        <Users className="h-3 w-3 mr-0.5" />{t('Hantera')}
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {facilityAreas.map(area => (
                      <Badge key={area.id} variant="outline" className="text-xs">{area.name}</Badge>
                    ))}
                    {facilityAreas.length === 0 && <span className="text-xs text-muted-foreground">{t('Inga områden')}</span>}
                  </div>

                  {(currentUser.roles.includes('administrator') || facility.owner_id === currentUser.id || (facility.admin_ids || []).includes(currentUser.id)) && (
                    <Link to={`/facilities/${facility.id}/access`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {t('Aktiva tillträden (')}{activeAccessFor(store.getApplications(), facility.id).length})
                    </Link>
                  )}

                  <div className="border-t border-border pt-3 mt-3">
                    <button
                      onClick={() => toggleExpandReqs(facility.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <Shield className="h-3 w-3" />
                      <span>{t('Krav (')}{reqNames.length})</span>
                      {showReqs ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>
                    {showReqs && (
                      <div className="mt-2 space-y-1">
                        {reqNames.length === 0 ? (
                          <p className="text-xs text-muted-foreground/70">{t('Inga krav kopplade')}</p>
                        ) : (
                          reqNames.map(r => r && (
                            <Badge key={r.id} variant="secondary" className="text-xs mr-1">
                              {r.name}
                            </Badge>
                          ))
                        )}
                        {currentUser.roles.includes('administrator') && (
                          <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => openReqDialog(facility.id)}>
                            <Pencil className="h-3 w-3 mr-1" />{t('Hantera krav')}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editFacility ? t('Redigera anläggning') : t('Ny anläggning')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Namn')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('Anläggningsnamn')} />
            </div>
            <div className="space-y-2">
              <Label>{t('Beskrivning')}</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('Beskrivning')} />
            </div>
            <div className="space-y-2">
              <Label>{t('Adress')}</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder={t('Gatuadress, Stad')} />
            </div>
            <div className="space-y-2">
              <Label>{t('Ägare')}</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder={t('Välj ägare')} /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('Avbryt')}</Button>
            <Button onClick={handleSave}>{editFacility ? t('Spara') : t('Skapa')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reqDialogOpen} onOpenChange={setReqDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Hantera krav för anläggning')}</DialogTitle>
          </DialogHeader>
          {reqFacilityId && (
            <div className="space-y-3">
              {allRequirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('Inga krav har skapats ännu. Gå till Krav-sidan för att skapa krav.')}</p>
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
                        {req.type === 'training' ? t('Utbildning') : req.type === 'certification' ? t('Certifiering') : t('Säkerhetsprövning')}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReqDialogOpen(false)}>{t('Stäng')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Tilldela administratörer')}</DialogTitle>
          </DialogHeader>
          {adminFacilityId && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('Välj vilka användare med rollen Anläggningsadministratör som ska administrera denna anläggning.')}
              </p>
              {facilityAdminCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('Inga användare med rollen Anläggningsadministratör finns. Tilldela rollen först under Användare.')}</p>
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
                            {r === 'facility_admin' ? t('Admin') : r === 'administrator' ? t('Superadmin') : r}
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
            <Button onClick={() => setAdminDialogOpen(false)}>{t('Stäng')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
