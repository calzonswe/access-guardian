import { useState, useRef } from 'react';
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
import { notifyApplicationStatusChange } from '@/services/notifications';
import * as api from '@/services/api';
import type { Application } from '@/types/rbac';
import type { Attachment } from '@/services/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editApplication?: Application | null;
  onSaved?: () => void;
}

const SECURITY_LABELS: Record<string, string> = { low: 'Låg', medium: 'Medel', high: 'Hög', critical: 'Kritisk' };

export function ApplicationFormDialog({ open, onOpenChange, editApplication, onSaved }: Props) {
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [facilityId, setFacilityId] = useState(editApplication?.facility_id || '');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(editApplication?.area_ids || []);
  const [startDate, setStartDate] = useState(editApplication?.start_date || '');
  const [endDate, setEndDate] = useState(editApplication?.end_date || '');
  const [justification, setJustification] = useState(editApplication?.exception_justification || '');
  const [pendingFiles, setPendingFiles] = useState<{ name: string; data: string }[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(editApplication?.attachments || []);
  const [uploading, setUploading] = useState(false);

  if (!currentUser) return null;

  const facilities = store.getFacilities();
  const areas = facilityId ? store.getAreas(facilityId) : [];
  const userReqs = store.getUserRequirements(currentUser.id);

  const facilityReqLinks = facilityId ? store.getFacilityRequirements(facilityId) : [];
  const facilityReqIds = facilityReqLinks.map(fr => fr.requirement_id);

  const areaReqIds = new Set<string>();
  for (const areaId of selectedAreas) {
    for (const ar of store.getAreaRequirements(areaId)) {
      areaReqIds.add(ar.requirement_id);
    }
  }

  const allReqIds = new Set([...facilityReqIds, ...areaReqIds]);
  const combinedRequirements = store.getRequirements().filter(r => allReqIds.has(r.id));

  const toggleArea = (areaId: string) => {
    setSelectedAreas(prev => prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]);
  };

  const fulfilledReqIds = userReqs.filter(ur => ur.status === 'fulfilled').map(ur => ur.requirement_id);
  const hasMissingReqs = combinedRequirements.length > 0 && combinedRequirements.some(r => !fulfilledReqIds.includes(r.id));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: { name: string; data: string }[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} är för stor (max 10 MB)`);
        continue;
      }
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          newFiles.push({ name: file.name, data: reader.result as string });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    setPendingFiles(prev => [...prev, ...newFiles]);
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
    if (editApplication) {
      store.updateApplication(editApplication.id, {
        facility_id: facilityId, area_ids: selectedAreas, start_date: startDate,
        end_date: endDate || undefined, has_exception: hasMissingReqs,
        exception_justification: hasMissingReqs ? justification : undefined,
      });
      appId = editApplication.id;
      toast.success('Ansökan uppdaterad');
    } else {
      const app = store.createApplication({
        applicant_id: currentUser.id, facility_id: facilityId, area_ids: selectedAreas,
        status: 'pending_manager', start_date: startDate, end_date: endDate || undefined,
        has_exception: hasMissingReqs, exception_justification: hasMissingReqs ? justification : undefined,
        attachments: [],
      });
      appId = app.id;
      store.addLog({ action: 'application_created', actor_id: currentUser.id, target_id: app.id, target_type: 'application', details: `Ny ansökan skapad för ${store.getFacility(facilityId)?.name}` });
      notifyApplicationStatusChange(app, 'pending_manager', currentUser.id);
      toast.success('Ansökan skapad');
    }

    setUploading(true);
    const newAttachments: Attachment[] = [];
    for (const pf of pendingFiles) {
      try {
        const data = pf.data.replace(/^data:[^;]+;base64,/, '');
        const att = await api.uploadAttachment(appId, pf.name, data);
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
        <DialogHeader><DialogTitle>{editApplication ? 'Redigera ansökan' : 'Ny tillträdesansökan'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
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
              <div className="space-y-2 rounded-lg border border-border p-3">
                {areas.map(area => (
                  <div key={area.id} className="flex items-center gap-2">
                    <Checkbox checked={selectedAreas.includes(area.id)} onCheckedChange={() => toggleArea(area.id)} />
                    <span className="text-sm">{area.name}</span>
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
          {hasMissingReqs && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-medium">Du saknar krav – motivering behövs</span></div>
              <Textarea placeholder="Motivera varför undantag ska beviljas..." value={justification} onChange={e => setJustification(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Bilagor</Label>
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
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" onChange={handleFileChange} className="hidden" id="attachment-input" />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" />Ladda upp bilagor
            </Button>
            <p className="text-xs text-muted-foreground">PDF, bilder, Word-dokument. Max 10 MB per fil.</p>
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

const SECURITY_LABELS: Record<string, string> = { low: 'Låg', medium: 'Medel', high: 'Hög', critical: 'Kritisk' };

export function ApplicationFormDialog({ open, onOpenChange, editApplication, onSaved }: Props) {
  const { currentUser } = useAuth();
  const [facilityId, setFacilityId] = useState(editApplication?.facility_id || '');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(editApplication?.area_ids || []);
  const [startDate, setStartDate] = useState(editApplication?.start_date || '');
  const [endDate, setEndDate] = useState(editApplication?.end_date || '');
  const [justification, setJustification] = useState(editApplication?.exception_justification || '');

  if (!currentUser) return null;

  const facilities = store.getFacilities();
  const areas = facilityId ? store.getAreas(facilityId) : [];
  const userReqs = store.getUserRequirements(currentUser.id);

  const facilityReqLinks = facilityId ? store.getFacilityRequirements(facilityId) : [];
  const facilityReqIds = facilityReqLinks.map(fr => fr.requirement_id);

  // Also gather area-specific requirements for selected areas
  const areaReqIds = new Set<string>();
  for (const areaId of selectedAreas) {
    for (const ar of store.getAreaRequirements(areaId)) {
      areaReqIds.add(ar.requirement_id);
    }
  }

  const allReqIds = new Set([...facilityReqIds, ...areaReqIds]);
  const combinedRequirements = store.getRequirements().filter(r => allReqIds.has(r.id));

  const toggleArea = (areaId: string) => {
    setSelectedAreas(prev => prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]);
  };

  const fulfilledReqIds = userReqs.filter(ur => ur.status === 'fulfilled').map(ur => ur.requirement_id);
  const hasMissingReqs = combinedRequirements.length > 0 && combinedRequirements.some(r => !fulfilledReqIds.includes(r.id));

  const handleSubmit = () => {
    if (!facilityId) { toast.error('Välj en anläggning'); return; }
    if (!startDate) { toast.error('Ange startdatum'); return; }
    if (hasMissingReqs && !justification.trim()) { toast.error('Motivering krävs vid saknade krav'); return; }

    if (editApplication) {
      store.updateApplication(editApplication.id, {
        facility_id: facilityId, area_ids: selectedAreas, start_date: startDate,
        end_date: endDate || undefined, has_exception: hasMissingReqs,
        exception_justification: hasMissingReqs ? justification : undefined,
      });
      toast.success('Ansökan uppdaterad');
    } else {
      const app = store.createApplication({
        applicant_id: currentUser.id, facility_id: facilityId, area_ids: selectedAreas,
        status: 'pending_manager', start_date: startDate, end_date: endDate || undefined,
        has_exception: hasMissingReqs, exception_justification: hasMissingReqs ? justification : undefined,
        attachments: [],
      });
      store.addLog({ action: 'application_created', actor_id: currentUser.id, target_id: app.id, target_type: 'application', details: `Ny ansökan skapad för ${store.getFacility(facilityId)?.name}` });
      notifyApplicationStatusChange(app, 'pending_manager', currentUser.id);
      toast.success('Ansökan skapad');
    }
    onSaved?.();
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => { setFacilityId(''); setSelectedAreas([]); setStartDate(''); setEndDate(''); setJustification(''); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editApplication ? 'Redigera ansökan' : 'Ny tillträdesansökan'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
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
              <div className="space-y-2 rounded-lg border border-border p-3">
                {areas.map(area => (
                  <div key={area.id} className="flex items-center gap-2">
                    <Checkbox checked={selectedAreas.includes(area.id)} onCheckedChange={() => toggleArea(area.id)} />
                    <span className="text-sm">{area.name}</span>
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
          {hasMissingReqs && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-medium">Du saknar krav – motivering behövs</span></div>
              <Textarea placeholder="Motivera varför undantag ska beviljas..." value={justification} onChange={e => setJustification(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Avbryt</Button>
          <Button onClick={handleSubmit}>{editApplication ? 'Spara' : 'Skicka ansökan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
