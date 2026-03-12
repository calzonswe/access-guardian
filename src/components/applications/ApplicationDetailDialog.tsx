import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, AlertTriangle, FileText, User, Building2, MapPin, Calendar } from 'lucide-react';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { MOCK_USERS, MOCK_FACILITIES, MOCK_AREAS, MOCK_USER_REQUIREMENTS, MOCK_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import { toast } from 'sonner';
import { useState } from 'react';

const STATUS_MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Utkast', className: 'bg-muted text-muted-foreground' },
  pending_manager: { label: 'Väntar på chef', className: 'status-badge-pending' },
  pending_facility: { label: 'Väntar på anläggning', className: 'status-badge-pending' },
  pending_exception: { label: 'Avsteg – väntar', className: 'status-badge-pending' },
  approved: { label: 'Godkänd', className: 'status-badge-approved' },
  denied: { label: 'Nekad', className: 'status-badge-denied' },
  expired: { label: 'Utgången', className: 'bg-muted text-muted-foreground' },
};

interface Props {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailDialog({ application, open, onOpenChange }: Props) {
  const { activeRole } = useAuth();
  const [denyReason, setDenyReason] = useState('');

  if (!application) return null;

  const applicant = MOCK_USERS.find(u => u.id === application.applicant_id);
  const facility = MOCK_FACILITIES.find(f => f.id === application.facility_id);
  const areas = MOCK_AREAS.filter(a => application.area_ids.includes(a.id));
  const status = STATUS_MAP[application.status];

  const applicantReqs = MOCK_USER_REQUIREMENTS.filter(ur => ur.user_id === application.applicant_id);
  const fulfilledReqIds = applicantReqs.filter(ur => ur.status === 'fulfilled').map(ur => ur.requirement_id);
  const allReqs = MOCK_REQUIREMENTS;

  const canApproveAsManager = activeRole === 'line_manager' && application.status === 'pending_manager';
  const canApproveAsFacility = (activeRole === 'facility_owner' || activeRole === 'facility_admin') && application.status === 'pending_facility';
  const canApproveException = activeRole === 'facility_owner' && application.status === 'pending_exception';
  const canApprove = canApproveAsManager || canApproveAsFacility || canApproveException;

  const handleApprove = () => {
    toast.success('Ansökan godkänd');
    onOpenChange(false);
  };
  const handleDeny = () => {
    if (!denyReason.trim()) {
      toast.error('Ange en anledning för avslaget');
      return;
    }
    toast.success('Ansökan nekad');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>Ansökningsdetaljer</DialogTitle>
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* Applicant info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Sökande</p>
                <p className="text-sm font-medium text-foreground">{applicant?.full_name}</p>
                <p className="text-xs text-muted-foreground">{applicant?.email}</p>
                {applicant?.roles.map(r => (
                  <Badge key={r} variant="secondary" className="text-[10px] mr-1 mt-1">{ROLE_LABELS[r]}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Anläggning</p>
                <p className="text-sm font-medium text-foreground">{facility?.name}</p>
                <p className="text-xs text-muted-foreground">{facility?.address}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Areas */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Begärda områden</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {areas.map(a => (
                  <Badge key={a.id} variant="outline" className="text-xs">{a.name} ({a.security_level})</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Period</p>
              <p className="text-sm text-foreground">
                {application.start_date} – {application.end_date ?? 'Tillsvidare'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Requirement fulfillment */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Kravuppfyllnad</p>
            <div className="grid gap-1.5">
              {allReqs.map(req => {
                const fulfilled = fulfilledReqIds.includes(req.id);
                return (
                  <div key={req.id} className="flex items-center gap-2 text-sm">
                    {fulfilled ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={fulfilled ? 'text-foreground' : 'text-muted-foreground'}>{req.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exception */}
          {application.has_exception && (
            <>
              <Separator />
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="flex items-center gap-2 text-warning mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium">Avsteg begärt</p>
                </div>
                <p className="text-sm text-muted-foreground">{application.exception_justification}</p>
              </div>
            </>
          )}

          {/* Attachments */}
          {application.attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Bilagor</p>
                {application.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                    <FileText className="h-3.5 w-3.5" />
                    {att.file_name}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Approval timeline */}
          <Separator />
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Historik</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Skapad: {new Date(application.created_at).toLocaleString('sv-SE')}</p>
              {application.manager_approved_at && (
                <p>Chef godkände: {new Date(application.manager_approved_at).toLocaleString('sv-SE')} ({MOCK_USERS.find(u => u.id === application.manager_approved_by)?.full_name})</p>
              )}
              {application.facility_approved_at && (
                <p>Anläggning godkände: {new Date(application.facility_approved_at).toLocaleString('sv-SE')} ({MOCK_USERS.find(u => u.id === application.facility_approved_by)?.full_name})</p>
              )}
            </div>
          </div>

          {/* Deny reason input */}
          {canApprove && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Anledning vid avslag (valfritt vid godkännande)</Label>
                <Textarea
                  value={denyReason}
                  onChange={e => setDenyReason(e.target.value)}
                  placeholder="Ange anledning om du nekar ansökan..."
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        {canApprove && (
          <DialogFooter className="gap-2">
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDeny}>
              <XCircle className="mr-2 h-4 w-4" />
              Neka
            </Button>
            <Button onClick={handleApprove}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Godkänn
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
