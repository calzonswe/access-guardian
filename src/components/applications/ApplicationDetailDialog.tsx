import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, FileText, Trash2, Pencil, Ban } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import * as store from '@/services/dataStore';
import { notifyApplicationStatusChange } from '@/services/notifications';
import type { Application, ApplicationStatus } from '@/types/rbac';

const STATUS_MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Utkast', className: 'bg-muted text-muted-foreground' },
  pending_manager: { label: 'Väntar på chef', className: 'status-badge-pending' },
  pending_facility: { label: 'Väntar på anläggning', className: 'status-badge-pending' },
  pending_exception: { label: 'Avsteg – väntar', className: 'bg-warning/10 text-warning border border-warning/20' },
  approved: { label: 'Godkänd', className: 'status-badge-approved' },
  denied: { label: 'Nekad', className: 'status-badge-denied' },
  expired: { label: 'Utgången / Återkallad', className: 'bg-muted text-muted-foreground' },
};

interface Props {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
  onEdit?: (app: Application) => void;
  onDelete?: (app: Application) => void;
}

export function ApplicationDetailDialog({ application, open, onOpenChange, onUpdated, onEdit, onDelete }: Props) {
  const { currentUser } = useAuth();
  const [denyReason, setDenyReason] = useState('');

  if (!application || !currentUser) return null;

  const applicant = store.getUser(application.applicant_id);
  const facility = store.getFacility(application.facility_id);
  const areas = store.getAreas().filter(a => application.area_ids.includes(a.id));
  const status = STATUS_MAP[application.status];

  const roles = currentUser.roles;
  const canApprove =
    (roles.includes('line_manager') && application.status === 'pending_manager') ||
    ((roles.includes('facility_owner') || roles.includes('facility_admin')) && application.status === 'pending_facility') ||
    (roles.includes('facility_owner') && application.status === 'pending_exception') ||
    (roles.includes('administrator'));

  const canEditDelete = application.applicant_id === currentUser.id && (application.status === 'draft' || application.status === 'pending_manager');

  // Revocation: facility_owner, facility_admin, or administrator can revoke approved access
  const canRevoke = application.status === 'approved' && (
    roles.includes('administrator') ||
    roles.includes('facility_owner') ||
    roles.includes('facility_admin')
  );

  const handleApprove = () => {
    let newStatus: ApplicationStatus = application.status;
    const updates: Partial<Application> = {};
    if (application.status === 'pending_manager') {
      newStatus = application.has_exception ? 'pending_exception' : 'pending_facility';
      updates.manager_approved_at = new Date().toISOString();
      updates.manager_approved_by = currentUser.id;
    } else if (application.status === 'pending_facility' || application.status === 'pending_exception') {
      newStatus = 'approved';
      updates.facility_approved_at = new Date().toISOString();
      updates.facility_approved_by = currentUser.id;
      if (application.has_exception) { updates.exception_approved_at = new Date().toISOString(); updates.exception_approved_by = currentUser.id; }
    }
    updates.status = newStatus;
    store.updateApplication(application.id, updates);
    store.addLog({ action: newStatus === 'approved' ? 'application_approved_facility' : 'application_approved_manager', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: 'Ansökan godkänd' });
    notifyApplicationStatusChange(application, newStatus, currentUser.id);
    toast.success('Ansökan godkänd');
    onUpdated?.(); onOpenChange(false);
  };

  const handleDeny = () => {
    store.updateApplication(application.id, { status: 'denied', denied_reason: denyReason });
    store.addLog({ action: 'application_denied', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: `Ansökan nekad: ${denyReason}` });
    notifyApplicationStatusChange(application, 'denied', currentUser.id);
    toast.success('Ansökan nekad'); setDenyReason(''); onUpdated?.(); onOpenChange(false);
  };

  const handleRevoke = () => {
    if (!confirm('Är du säker på att du vill återkalla detta tillträde?')) return;
    store.updateApplication(application.id, { status: 'expired' });
    store.addLog({ action: 'access_revoked', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: `Tillträde återkallat för ${applicant?.full_name ?? 'okänd'} till ${facility?.name ?? 'okänd'}` });
    notifyApplicationStatusChange({ ...application, status: 'approved' }, 'expired', currentUser.id);
    toast.success('Tillträde återkallat');
    onUpdated?.(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Ansökningsdetaljer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
            <div className="flex gap-1">
              {canEditDelete && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => onEdit?.(application)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete?.(application)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </>
              )}
              {canRevoke && (
                <Button variant="destructive" size="sm" onClick={handleRevoke}>
                  <Ban className="mr-1 h-4 w-4" />Återkalla
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Sökande:</span> <span className="font-medium">{applicant?.full_name ?? '–'}</span></div>
            <div><span className="text-muted-foreground">Anläggning:</span> <span className="font-medium">{facility?.name ?? '–'}</span></div>
            <div><span className="text-muted-foreground">Startdatum:</span> <span className="font-medium">{application.start_date}</span></div>
            <div><span className="text-muted-foreground">Slutdatum:</span> <span className="font-medium">{application.end_date ?? 'Tillsvidare'}</span></div>
          </div>
          {areas.length > 0 && (
            <div><p className="text-sm text-muted-foreground mb-1">Begärda områden:</p><div className="flex flex-wrap gap-1">{areas.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>)}</div></div>
          )}
          {application.has_exception && application.exception_justification && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3"><p className="text-sm font-medium text-warning mb-1">Undantagsmotivering</p><p className="text-sm text-foreground">{application.exception_justification}</p></div>
          )}
          {application.denied_reason && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm font-medium text-destructive mb-1">Avslag</p><p className="text-sm text-foreground">{application.denied_reason}</p></div>
          )}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Skapad: {new Date(application.created_at).toLocaleString('sv-SE')}</p>
            {application.manager_approved_at && <p className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-success" />Chef godkänd: {new Date(application.manager_approved_at).toLocaleString('sv-SE')}</p>}
            {application.facility_approved_at && <p className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-success" />Anläggning godkänd: {new Date(application.facility_approved_at).toLocaleString('sv-SE')}</p>}
          </div>
          {canApprove && application.status !== 'approved' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Textarea placeholder="Anledning vid avslag (valfritt)..." value={denyReason} onChange={e => setDenyReason(e.target.value)} />
                <div className="flex gap-2 justify-end">
                  <Button variant="destructive" size="sm" onClick={handleDeny}><XCircle className="mr-1 h-4 w-4" />Neka</Button>
                  <Button size="sm" onClick={handleApprove}><CheckCircle className="mr-1 h-4 w-4" />Godkänn</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
