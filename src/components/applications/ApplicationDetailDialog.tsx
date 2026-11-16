import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, FileText, Trash2, Pencil, Ban, Download, Send, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import * as store from '@/services/dataStore';
import { downloadAttachment } from '@/services/api';
import { notifyApplicationStatusChange } from '@/services/notifications';
import { canActOn, canRenew, nextApproveStatus } from '@/lib/applicationRules';
import { ApplicationHistory } from '@/components/applications/ApplicationHistory';
import { subordinateIds } from '@/hooks/useActionableApplications';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { errorMessage } from '@/lib/utils';
import { t, locale } from '@/i18n';

const STATUS_MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: t('Utkast'), className: 'status-badge-neutral' },
  pending_manager: { label: t('Väntar på chef'), className: 'status-badge-pending' },
  pending_facility: { label: t('Väntar på anläggning'), className: 'status-badge-pending' },
  pending_exception: { label: t('Avsteg – väntar'), className: 'status-badge-pending' },
  approved: { label: t('Godkänd'), className: 'status-badge-approved' },
  denied: { label: t('Nekad'), className: 'status-badge-denied' },
  expired: { label: t('Utgången / Återkallad'), className: 'status-badge-neutral' },
};

interface Props {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
  onEdit?: (app: Application) => void;
  onDelete?: (app: Application) => void;
  /** Open a new, prefilled application ("Förläng" / "Ansök igen"). */
  onReapply?: (app: Application) => void;
}

export function ApplicationDetailDialog({ application, open, onOpenChange, onUpdated, onEdit, onDelete, onReapply }: Props) {
  const { currentUser } = useAuth();
  const [denyReason, setDenyReason] = useState('');
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  // The dialog stays mounted: clear typed reasons when another application is shown.
  useEffect(() => {
    setDenyReason(''); setRevokeOpen(false); setRevokeReason('');
  }, [application?.id]);

  if (!application || !currentUser) return null;

  const applicant = store.getUser(application.applicant_id);
  const facility = store.getFacility(application.facility_id);
  const areas = store.getAreas().filter(a => application.area_ids.includes(a.id));
  const status = application.status === 'expired'
    ? { ...STATUS_MAP.expired, label: application.revoked_at ? t('Återkallad') : t('Utgången') }
    : STATUS_MAP[application.status];

  const roles = currentUser.roles;
  const isAdmin = roles.includes('administrator');
  const isApplicant = application.applicant_id === currentUser.id;
  const isFacilityOwner = facility?.owner_id === currentUser.id;
  const isFacilityStaff = isFacilityOwner || !!facility?.admin_ids?.includes(currentUser.id);
  // Mirrors the backend transition rules; the backend makes the final decision.
  const canApprove = canActOn(application, currentUser, {
    facility,
    applicant,
    managedIds: roles.includes('line_manager') ? subordinateIds(currentUser.id, store.getUsers()) : [],
    substituteFor: currentUser.substituting_for || [],
  });

  const canEdit = isApplicant && (application.status === 'draft' || application.status === 'pending_manager');
  const canDelete = (isApplicant || isAdmin) && (application.status === 'draft' || application.status === 'denied');
  const canSubmit = (isApplicant || isAdmin) && application.status === 'draft';

  // Revocation: staff of this facility or an administrator
  const canRevoke = application.status === 'approved' && (isAdmin || isFacilityStaff);

  const handleSubmitDraft = async () => {
    try {
      await store.updateApplication(application.id, { status: 'pending_manager' });
      await notifyApplicationStatusChange(application, 'pending_manager', currentUser.id);
      toast.success(t('Ansökan inskickad'));
      onUpdated?.(); onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Kunde inte skicka in ansökan'));
    }
  };

  const handleApprove = async () => {
    let newStatus: ApplicationStatus = application.status;
    const updates: Partial<Application> = {};
    if (application.status === 'pending_manager') {
      newStatus = nextApproveStatus(application) ?? newStatus;
      updates.manager_approved_at = new Date().toISOString();
      updates.manager_approved_by = currentUser.id;
    } else if (application.status === 'pending_facility' || application.status === 'pending_exception') {
      newStatus = nextApproveStatus(application) ?? newStatus;
      updates.facility_approved_at = new Date().toISOString();
      updates.facility_approved_by = currentUser.id;
      if (application.has_exception) { updates.exception_approved_at = new Date().toISOString(); updates.exception_approved_by = currentUser.id; }
    }
    updates.status = newStatus;
    try {
      await store.updateApplication(application.id, updates);
      await store.addLog({ action: newStatus === 'approved' ? 'application_approved_facility' : 'application_approved_manager', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: t('Ansökan godkänd') });
      await notifyApplicationStatusChange(application, newStatus, currentUser.id);
      toast.success(
        newStatus === 'pending_facility' ? t('Godkänd – skickad till anläggningen för beslut')
          : newStatus === 'pending_exception' ? t('Godkänd – skickad till anläggningsägaren för beslut om avsteg')
            : t('Ansökan godkänd')
      );
      onUpdated?.(); onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t('Kunde inte godkänna ansökan')));
    }
  };

  const handleDeny = async () => {
    try {
      await store.updateApplication(application.id, { status: 'denied', denied_reason: denyReason });
      await store.addLog({ action: 'application_denied', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: t('Ansökan nekad: {denyReason}', { denyReason }) });
      await notifyApplicationStatusChange(application, 'denied', currentUser.id);
      toast.success(t('Ansökan nekad')); setDenyReason(''); onUpdated?.(); onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t('Kunde inte neka ansökan')));
    }
  };

  const handleRevoke = async () => {
    if (!revokeReason.trim()) { toast.error(t('Ange en anledning till återkallelsen')); return; }
    try {
      await store.updateApplication(application.id, { status: 'expired', revoke_reason: revokeReason.trim() });
      await store.addLog({ action: 'access_revoked', actor_id: currentUser.id, target_id: application.id, target_type: 'application', details: t('Tillträde återkallat för {v0} till {v1}', { v0: applicant?.full_name ?? 'okänd', v1: facility?.name ?? 'okänd' }) });
      await notifyApplicationStatusChange({ ...application, status: 'approved' }, 'expired', currentUser.id);
      toast.success(t('Tillträde återkallat'));
      setRevokeOpen(false); setRevokeReason('');
      onUpdated?.(); onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t('Kunde inte återkalla tillträdet')));
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />{t('Ansökningsdetaljer')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
            <div className="flex gap-1">
              {onReapply && canRenew(application, currentUser) && (
                <Button size="sm" onClick={() => onReapply(application)}><RefreshCw className="mr-1 h-4 w-4" />{t('Förläng')}</Button>
              )}
              {onReapply && isApplicant && application.status === 'denied' && (
                <Button size="sm" variant="outline" onClick={() => onReapply(application)}><RotateCcw className="mr-1 h-4 w-4" />{t('Ansök igen')}</Button>
              )}
              {canSubmit && (
                <Button size="sm" onClick={handleSubmitDraft}><Send className="mr-1 h-4 w-4" />{t('Skicka in')}</Button>
              )}
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label={t('Redigera')} title={t('Redigera')} onClick={() => onEdit?.(application)}><Pencil className="h-4 w-4" /></Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon" aria-label={t('Ta bort')} title={t('Ta bort')} onClick={() => onDelete?.(application)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              )}
              {canRevoke && (
                <Button variant="destructive" size="sm" onClick={() => setRevokeOpen(o => !o)}>
                  <Ban className="mr-1 h-4 w-4" />{t('Återkalla')}
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t('Sökande:')}</span> <span className="font-medium">{applicant?.full_name ?? '–'}</span></div>
            <div><span className="text-muted-foreground">{t('Anläggning:')}</span> <span className="font-medium">{facility?.name ?? '–'}</span></div>
            <div><span className="text-muted-foreground">Startdatum:</span> <span className="font-medium">{application.start_date}</span></div>
            <div><span className="text-muted-foreground">Slutdatum:</span> <span className="font-medium">{application.end_date ?? t('Tillsvidare')}</span></div>
          </div>
          {areas.length > 0 && (
            <div><p className="text-sm text-muted-foreground mb-1">{t('Begärda områden:')}</p><div className="flex flex-wrap gap-1">{areas.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>)}</div></div>
          )}
          {application.attachments && application.attachments.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Bilagor:</p>
              <div className="space-y-1">
                {application.attachments.map(att => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => downloadAttachment(att.file_url || att.id, att.file_name).catch(err => toast.error(err.message))}
                    className="flex w-full items-center gap-2 text-left text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    <span>{att.file_name}</span>
                    <Download className="h-3 w-3 ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {application.has_exception && application.exception_justification && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3"><p className="text-sm font-medium text-warning mb-1">{t('Undantagsmotivering')}</p><p className="text-sm text-foreground">{application.exception_justification}</p></div>
          )}
          {revokeOpen && canRevoke && (
            <div className="rounded-lg border border-destructive/30 p-3 space-y-2">
              <p className="text-sm font-medium text-destructive">{t('Återkalla tillträde')}</p>
              <Textarea placeholder={t('Anledning (visas för den sökande)...')} value={revokeReason} onChange={e => setRevokeReason(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setRevokeOpen(false); setRevokeReason(''); }}>{t('Avbryt')}</Button>
                <Button variant="destructive" size="sm" onClick={handleRevoke}>{t('Bekräfta återkallelse')}</Button>
              </div>
            </div>
          )}
          {application.revoked_at && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive mb-1">{t('Återkallad')} {new Date(application.revoked_at).toLocaleString(locale())}{store.getUser(application.revoked_by || '')?.full_name ? ` av ${store.getUser(application.revoked_by || '')?.full_name}` : ''}</p>
              {application.revoke_reason && <p className="text-sm text-foreground">{application.revoke_reason}</p>}
            </div>
          )}
          {application.denied_reason && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm font-medium text-destructive mb-1">{t('Avslag')}</p><p className="text-sm text-foreground">{application.denied_reason}</p></div>
          )}
          <Separator />
          {store.isApiMode() ? (
            <ApplicationHistory applicationId={application.id} />
          ) : (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Skapad: {new Date(application.created_at).toLocaleString(locale())}</p>
              {application.manager_approved_at && <p className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-success" />{t('Chef godkänd:')} {new Date(application.manager_approved_at).toLocaleString(locale())}</p>}
              {application.facility_approved_at && <p className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-success" />{t('Anläggning godkänd:')} {new Date(application.facility_approved_at).toLocaleString(locale())}</p>}
            </div>
          )}
          {canApprove && (
            <>
              <Separator />
              <div className="space-y-3">
                <Textarea placeholder={t('Anledning vid avslag (valfritt)...')} value={denyReason} onChange={e => setDenyReason(e.target.value)} />
                <div className="flex gap-2 justify-end">
                  <Button variant="destructive" size="sm" onClick={handleDeny}><XCircle className="mr-1 h-4 w-4" />{t('Neka')}</Button>
                  <Button size="sm" onClick={handleApprove}><CheckCircle className="mr-1 h-4 w-4" />{t('Godkänn')}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
