import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Paperclip, X, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import * as store from '@/services/dataStore';
import { checkRequirements } from '@/lib/requirements';
import { renewalStartDate } from '@/lib/applicationRules';
import { RequirementChecklist } from '@/components/applications/RequirementChecklist';
import { notifyApplicationStatusChange } from '@/services/notifications';
import * as api from '@/services/api';
import type { Application } from '@/types/rbac';
import type { Attachment } from '@/services/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editApplication?: Application | null;
  /** Prefill a new application from an earlier one ("Förläng" / "Ansök igen"). */
  templateApplication?: Application | null;
  onSaved?: () => void;
}

const SECURITY_LABELS: Record<string, string> = { low: 'Låg', medium: 'Medel', high: 'Hög', critical: 'Kritisk' };

export function ApplicationFormDialog({ open, onOpenChange, editApplication, templateApplication, onSaved }: Props) {
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [facilityId, setFacilityId] = useState(editApplication?.facility_id || '');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(editApplication?.area_ids || []);
  const [startDate, setStartDate] = useState(editApplication?.start_date || '');
  const [endDate, setEndDate] = useState(editApplication?.end_date || '');
  const [justification, setJustification] = useState(editApplication?.exception_justification || '');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(editApplication?.attachments || []);
  const [uploading, setUploading] = useState(false);

  // The dialog stays mounted between uses: reset every field from the
  // application being edited (or to empty for a new one) each time it opens.
  // Otherwise "edit" opened empty and a new form showed the previous
  // application's attachments.
  useEffect(() => {
    if (!open) return;
    const template = !editApplication ? templateApplication : null;
    if (template) {
      // Only areas that still exist in the facility (areas may have been removed since).
      const existing = new Set(store.getAreas(template.facility_id).map(a => a.id));
      setFacilityId(template.facility_id);
      setSelectedAreas((template.area_ids || []).filter(id => existing.has(id)));
      setStartDate(renewalStartDate(template));
      setEndDate('');
      setJustification('');
      setPendingFiles([]);
      setExistingAttachments([]);
      return;
    }
    setFacilityId(editApplication?.facility_id || '');
    setSelectedAreas(editApplication?.area_ids || []);
    setStartDate((editApplication?.start_date || '').slice(0, 10));
    setEndDate((editApplication?.end_date || '').slice(0, 10));
    setJustification(editApplication?.exception_justification || '');
    setPendingFiles([]);
    setExistingAttachments(editApplication?.attachments || []);
  }, [open, editApplication, templateApplication]);

  if (!currentUser) return null;

  const facilities = store.getFacilities();
  const areas = facilityId ? store.getAreas(facilityId) : [];

  // Areas ordered as a tree with depth for indentation
  const areaTree: { area: typeof areas[number]; depth: number }[] = [];
  const walkAreas = (parent: string | null, depth: number) => {
    areas
      .filter(a => (a.parent_id || null) === parent)
      .sort((x, y) => x.name.localeCompare(y.name, 'sv'))
      .forEach(a => { areaTree.push({ area: a, depth }); walkAreas(a.id, depth + 1); });
  };
  walkAreas(null, 0);
  for (const a of areas) if (!areaTree.some(t => t.area.id === a.id)) areaTree.push({ area: a, depth: 0 });

  const ancestorsOf = (areaId: string): string[] => {
    const out: string[] = [];
    let cur = areas.find(a => a.id === areaId)?.parent_id || null;
    while (cur) { out.push(cur); cur = areas.find(a => a.id === cur)?.parent_id || null; }
    return out;
  };
  const descendantsOf = (areaId: string): string[] => {
    const kids = areas.filter(a => a.parent_id === areaId);
    return kids.flatMap(k => [k.id, ...descendantsOf(k.id)]);
  };
  // A parent is locked while any of its sub-areas is selected
  const lockedAreaIds = new Set(selectedAreas.flatMap(id => ancestorsOf(id)));

  const toggleArea = (areaId: string) => {
    setSelectedAreas(prev => {
      if (prev.includes(areaId)) {
        // Unselecting a parent also unselects everything below it
        const remove = new Set([areaId, ...descendantsOf(areaId)]);
        return prev.filter(id => !remove.has(id));
      }
      // Selecting an area automatically includes all areas above it
      return Array.from(new Set([...prev, areaId, ...ancestorsOf(areaId)]));
    });
  };

  const requirementChecks = checkRequirements(currentUser.id, facilityId, selectedAreas, endDate || undefined);
  const hasMissingReqs = requirementChecks.some(c => c.state === 'missing');
  const isRenewal = !editApplication && !!templateApplication && ['approved', 'expired'].includes(templateApplication.status);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} är för stor (max 10 MB)`);
        continue;
      }
      accepted.push(file);
    }
    setPendingFiles(prev => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const removeAttachment = async (id: string) => {
    try {
      await api.deleteAttachment(id);
      setExistingAttachments(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error('Kunde inte ta bort bilagan');
    }
  };

  const handleSubmit = async () => {
    if (!facilityId) { toast.error('Välj en anläggning'); return; }
    if (!startDate) { toast.error('Ange startdatum'); return; }
    if (hasMissingReqs && !justification.trim()) { toast.error('Motivering krävs vid saknade krav'); return; }

    let appId: string;
    try {
      if (editApplication) {
        await store.updateApplication(editApplication.id, {
          facility_id: facilityId, area_ids: selectedAreas, start_date: startDate,
          end_date: endDate || undefined, has_exception: hasMissingReqs,
          exception_justification: hasMissingReqs ? justification : undefined,
        });
        appId = editApplication.id;
        toast.success('Ansökan uppdaterad');
      } else {
        const app = await store.createApplication({
          applicant_id: currentUser.id, facility_id: facilityId, area_ids: selectedAreas,
          status: 'pending_manager', start_date: startDate, end_date: endDate || undefined,
          has_exception: hasMissingReqs, exception_justification: hasMissingReqs ? justification : undefined,
          attachments: [],
          renewed_from_id: isRenewal ? templateApplication.id : undefined,
        });
        appId = app.id;
        store.addLog({ action: 'application_created', actor_id: currentUser.id, target_id: app.id, target_type: 'application', details: `Ny ansökan skapad för ${store.getFacility(facilityId)?.name}` });
        notifyApplicationStatusChange(app, 'pending_manager', currentUser.id);
        toast.success('Ansökan skapad och inskickad');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte spara ansökan');
      return;
    }

    if (!store.isApiMode() && pendingFiles.length > 0) {
      toast.info('Bilagor kan bara laddas upp när servern används');
      setPendingFiles([]);
    }
    setUploading(true);
    const newAttachments: Attachment[] = [];
    for (const pf of store.isApiMode() ? pendingFiles : []) {
      try {
        const att = await api.uploadAttachmentMultipart(appId, pf);
        newAttachments.push(att);
      } catch {
        toast.error(`Kunde inte ladda upp ${pf.name}`);
      }
    }
    setUploading(false);

    if (newAttachments.length > 0) {
      setExistingAttachments(prev => [...prev, ...newAttachments]);
    }
    onSaved?.();
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setFacilityId(''); setSelectedAreas([]); setStartDate(''); setEndDate(''); setJustification('');
    setPendingFiles([]); setExistingAttachments(editApplication?.attachments || []);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editApplication ? 'Redigera ansökan' : isRenewal ? 'Förläng tillträde' : templateApplication ? 'Ansök igen' : 'Ny tillträdesansökan'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!currentUser.manager_id && !currentUser.contact_person_id && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-foreground">
              Du har ingen närmaste chef registrerad. Ansökan skickas till en administratör för granskning.
            </div>
          )}
          <div className="space-y-2">
            <Label>Anläggning</Label>
            <Select value={facilityId} onValueChange={v => { setFacilityId(v); setSelectedAreas([]); }}>
              <SelectTrigger><SelectValue placeholder="Välj anläggning" /></SelectTrigger>
              <SelectContent>{facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {facilityId && areas.length > 0 && (
            <div className="space-y-2">
              <Label>Områden (valfritt)</Label>
              <p className="text-xs text-muted-foreground">Väljer du ett underområde inkluderas överordnade områden automatiskt.</p>
              <div className="space-y-2 rounded-lg border border-border p-3">
                {areaTree.map(({ area, depth }) => (
                  <div key={area.id} className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
                    <Checkbox
                      checked={selectedAreas.includes(area.id)}
                      disabled={lockedAreaIds.has(area.id)}
                      onCheckedChange={() => toggleArea(area.id)}
                    />
                    <span className="text-sm">{area.name}</span>
                    {lockedAreaIds.has(area.id) && <span className="text-xs text-muted-foreground">(krävs)</span>}
                    <Badge variant="outline" className="text-xs ml-auto">{SECURITY_LABELS[area.security_level]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Startdatum</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Slutdatum (valfritt)</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>
          {facilityId && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label className="block">Krav för ditt val</Label>
              <RequirementChecklist checks={requirementChecks} emptyText="Inga krav för den här anläggningen och de valda områdena." />
            </div>
          )}
          {hasMissingReqs && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-medium">Du saknar krav – motivering behövs</span></div>
              <Textarea placeholder="Motivera varför undantag ska beviljas..." value={justification} onChange={e => setJustification(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label className="block">Bilagor</Label>
            {(existingAttachments.length > 0 || pendingFiles.length > 0) && (
              <div className="space-y-1 rounded-lg border border-border p-2">
                {existingAttachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{att.file_name}</span>
                    <button onClick={() => removeAttachment(att.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                {pendingFiles.map((pf, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{pf.name}</span>
                    <span className="text-xs text-warning">(ej uppladdad)</span>
                    <button onClick={() => removePendingFile(idx)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.txt,.csv" onChange={handleFileChange} className="hidden" id="attachment-input" />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" />Ladda upp bilagor
            </Button>
            <p className="text-xs text-muted-foreground">PDF, bilder, Word/Excel, text/CSV. Max 10 MB per fil.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={uploading}>{uploading ? 'Laddar upp...' : (editApplication ? 'Spara' : 'Skicka ansökan')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


