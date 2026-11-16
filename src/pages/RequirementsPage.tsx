import { useState } from 'react';
import { Shield, Plus, Clock, Award, Lock, Pencil, Trash2, Search } from 'lucide-react';
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
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Requirement } from '@/types/rbac';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { t } from '@/i18n';

const TYPE_LABELS: Record<string, string> = { certification: t('Certifiering'), clearance: t('Säkerhetsprövning'), training: t('Utbildning') };
const TYPE_ICONS: Record<string, typeof Award> = { certification: Award, clearance: Lock, training: Shield };

export default function RequirementsPage() {
  const { currentUser } = useAuth();
  const { loading, reload } = useDataRefresh();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReq, setEditReq] = useState<Requirement | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');


  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Requirement['type']>('training');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [validityDays, setValidityDays] = useState(365);

  if (!currentUser) return null;

  const allRequirements = store.getRequirements();
  const q = search.trim().toLowerCase();
  const requirements = allRequirements.filter(r =>
    (typeFilter === 'all' || r.type === typeFilter) &&
    (!q || (r.name || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
  );


  const openCreate = () => {
    setEditReq(null); setName(''); setDescription(''); setType('training'); setHasExpiry(false); setValidityDays(365);
    setDialogOpen(true);
  };

  const openEdit = (r: Requirement) => {
    setEditReq(r); setName(r.name); setDescription(r.description); setType(r.type); setHasExpiry(r.has_expiry); setValidityDays(r.validity_days || 365);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('Ange namn')); return; }
    if (hasExpiry && !(Number(validityDays) > 0)) { toast.error(t('Ange giltighetstid i dagar (minst 1)')); return; }
    try {
      if (editReq) {
        await store.updateRequirement(editReq.id, { name, description, type, has_expiry: hasExpiry, validity_days: hasExpiry ? validityDays : undefined });
        toast.success(t('Krav uppdaterat'));
      } else {
        await store.createRequirement({ name, description, type, has_expiry: hasExpiry, validity_days: hasExpiry ? validityDays : undefined });
        await store.addLog({ action: 'requirement_created', actor_id: currentUser.id, details: t('Nytt krav skapat: {name}', { name }) });
        toast.success(t('Krav skapat'));
      }
      setDialogOpen(false); reload();
    } catch (err) {
      toast.error(errorMessage(err, t('Kunde inte spara krav')));
    }
  };

  const handleDelete = async (r: Requirement) => {
    if (confirm(t('Ta bort "{name}"?', { name: r.name }))) {
      await store.deleteRequirement(r.id);
      toast.success(t('Krav borttaget')); reload();
    }
  };

  // Requirement management is administrator-only on the backend.
  const canEdit = currentUser.roles.includes('administrator');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('Krav')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('Hantera certifieringar, utbildningar och säkerhetsprövningar')}</p>
        </div>
        {canEdit && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t('Nytt krav')}</Button>}
      </div>

      {allRequirements.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t('Sök krav...')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('Alla typer')}</SelectItem>
              <SelectItem value="training">{t('Utbildning')}</SelectItem>
              <SelectItem value="certification">{t('Certifiering')}</SelectItem>
              <SelectItem value="clearance">{t('Säkerhetsprövning')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {requirements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                {allRequirements.length > 0 ? t('Inga krav matchar filtret') : t('Inga krav definierade')}
              </p>
              {allRequirements.length === 0 && <p className="text-sm text-muted-foreground/70 mt-1">{t('Skapa krav som utbildningar och certifieringar')}</p>}
            </div>

          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Krav')}</TableHead>
                  <TableHead>{t('Typ')}</TableHead>
                  <TableHead>{t('Beskrivning')}</TableHead>
                  <TableHead>{t('Giltighetstid')}</TableHead>
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
                          <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.validity_days ? `${req.validity_days} dagar` : t('Giltighetstid saknas')}</div>
                        ) : (
                          <span className="text-success">{t('Permanent')}</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" aria-label={t('Redigera')} title={t('Redigera')} className="h-7 w-7" onClick={() => openEdit(req)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" aria-label={t('Ta bort')} title={t('Ta bort')} className="h-7 w-7" onClick={() => handleDelete(req)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editReq ? t('Redigera krav') : t('Nytt krav')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t('Namn')}</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('Beskrivning')}</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>{t('Typ')}</Label>
              <Select value={type} onValueChange={v => setType(v as Requirement['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">{t('Utbildning')}</SelectItem>
                  <SelectItem value="certification">{t('Certifiering')}</SelectItem>
                  <SelectItem value="clearance">{t('Säkerhetsprövning')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('Har giltighetstid')}</Label>
              <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
            </div>
            {hasExpiry && (
              <div className="space-y-2">
                <Label>{t('Giltighetstid (dagar)')}</Label>
                <Input type="number" value={validityDays} onChange={e => setValidityDays(parseInt(e.target.value) || 0)} min={1} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('Avbryt')}</Button>
            <Button onClick={handleSave}>{editReq ? t('Spara') : t('Skapa')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
