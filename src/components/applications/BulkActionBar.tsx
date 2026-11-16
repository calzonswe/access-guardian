import { useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as store from '@/services/dataStore';
import { nextApproveStatus } from '@/lib/applicationRules';
import { errorMessage } from '@/lib/utils';
import type { Application } from '@/types/rbac';

interface Props {
  selected: Application[];
  onClear: () => void;
  /** Called after a run with the ids that failed (they stay selected). */
  onDone: (failedIds: string[]) => void;
}

/**
 * Approve or deny several applications. Each one goes through the normal
 * per-application request, so exactly the same rules apply as one by one.
 */
export function BulkActionBar({ selected, onClear, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (selected.length === 0) return null;

  const run = async (kind: 'approve' | 'deny') => {
    setBusy(true);
    const failed: { id: string; message: string }[] = [];
    let ok = 0;
    for (const app of selected) {
      try {
        const status = kind === 'approve' ? nextApproveStatus(app) : 'denied';
        if (!status) throw new Error('Ansökan kan inte godkännas i sin nuvarande status');
        await store.updateApplication(app.id, kind === 'deny' ? { status, denied_reason: reason.trim() } : { status });
        ok++;
      } catch (err) {
        failed.push({ id: app.id, message: errorMessage(err, 'Okänt fel') });
      }
    }
    setBusy(false);
    setConfirmApprove(false);
    setDenyOpen(false);
    setReason('');
    const verb = kind === 'approve' ? 'godkända' : 'nekade';
    if (failed.length === 0) {
      toast.success(`${ok} ${verb}`);
    } else {
      toast.error(`${ok} ${verb}, ${failed.length} misslyckades`, { description: failed[0].message });
    }
    onDone(failed.map(f => f.id));
  };

  const n = selected.length;
  return (
    <>
      <div
        role="region"
        aria-label="Massåtgärder"
        className="sticky bottom-3 z-20 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-border bg-popover p-3 shadow-lg"
      >
        <span className="text-sm font-medium text-foreground">{n} markerade</span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setConfirmApprove(true)} disabled={busy}>
          <CheckCircle className="mr-1 h-4 w-4" />Godkänn
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setDenyOpen(true)} disabled={busy}>
          <XCircle className="mr-1 h-4 w-4" />Neka
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          <X className="mr-1 h-4 w-4" />Avmarkera
        </Button>
      </div>

      <Dialog open={confirmApprove} onOpenChange={o => !busy && setConfirmApprove(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Godkänn {n} ansökningar?</DialogTitle>
            <DialogDescription>Varje ansökan går vidare till nästa steg, precis som om du godkände dem en i taget.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(false)} disabled={busy}>Avbryt</Button>
            <Button onClick={() => run('approve')} disabled={busy}>{busy ? 'Godkänner…' : `Godkänn ${n}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={denyOpen} onOpenChange={o => !busy && setDenyOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neka {n} ansökningar?</DialogTitle>
            <DialogDescription>Anledningen visas för varje sökande.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-deny-reason">Anledning</Label>
            <Textarea id="bulk-deny-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="T.ex. Behov saknas" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyOpen(false)} disabled={busy}>Avbryt</Button>
            <Button variant="destructive" onClick={() => run('deny')} disabled={busy || !reason.trim()}>{busy ? 'Nekar…' : `Neka ${n}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
