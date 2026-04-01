import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Plus, Trash2, Clock, Paperclip, Download } from 'lucide-react';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { User, UserRequirement } from '@/types/rbac';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: User | null;
  onUpdated?: () => void;
}

const TYPE_LABELS: Record<string, string> = { certification: 'Certifiering', clearance: 'Säkerhetsprövning', training: 'Utbildning' };

export default function UserRequirementDialog({ open, onOpenChange, targetUser, onUpdated }: Props) {
  const { currentUser } = useAuth();
  const [addReqId, setAddReqId] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<{ name: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  if (!targetUser || !currentUser) return null;

  const allRequirements = store.getRequirements();
  const userReqs = store.getUserRequirements(targetUser.id);
  const availableReqs = allRequirements.filter(r => !userReqs.some(ur => ur.requirement_id === r.id));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Filen får inte vara större än 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentFile({ name: file.name, data: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = () => {
    if (!addReqId) return;
    const req = allRequirements.find(r => r.id === addReqId);
    if (!req) return;

    const now = new Date().toISOString();
    const expiresAt = req.has_expiry && req.validity_days
      ? new Date(Date.now() + req.validity_days * 86400000).toISOString()
      : undefined;

    store.createUserRequirement({
      user_id: targetUser.id,
      requirement_id: addReqId,
      fulfilled_at: now,
      expires_at: expiresAt,
      certified_by: currentUser.id,
      status: 'fulfilled',
      attachment_name: attachmentFile?.name,
      attachment_data: attachmentFile?.data,
    });

    store.addLog({
      action: 'requirement_fulfilled',
      actor_id: currentUser.id,
      target_id: targetUser.id,
      target_type: 'user',
      details: `Krav uppfyllt: ${req.name} för ${targetUser.full_name}${attachmentFile ? ` (bilaga: ${attachmentFile.name})` : ''}`,
    });

    store.createNotification({
      user_id: targetUser.id,
      title: 'Krav registrerat',
      message: `${req.name} har markerats som uppfyllt av ${currentUser.full_name}`,
      type: 'info',
      read: false,
    });

    toast.success(`${req.name} registrerat som uppfyllt`);
    setAddReqId('');
    setAttachmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    reload();
    onUpdated?.();
  };

  const handleRemove = (ur: UserRequirement) => {
    const req = allRequirements.find(r => r.id === ur.requirement_id);
    if (confirm(`Ta bort uppfyllnad av "${req?.name}"?`)) {
      store.deleteUserRequirement(ur.id);
      toast.success('Kravuppfyllnad borttagen');
      reload();
      onUpdated?.();
    }
  };

  const handleDownload = (ur: UserRequirement & { attachment_name?: string; attachment_data?: string }) => {
    if (!ur.attachment_data || !ur.attachment_name) return;
    const a = document.createElement('a');
    a.href = ur.attachment_data;
    a.download = ur.attachment_name;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kravuppfyllnad – {targetUser.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Uppfyllda krav</Label>
            {userReqs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Inga krav registrerade</p>
            ) : (
              <div className="space-y-2">
                {userReqs.map(ur => {
                  const req = allRequirements.find(r => r.id === ur.requirement_id);
                  if (!req) return null;
                  const isExpired = ur.expires_at && new Date(ur.expires_at) < new Date();
                  const hasAttachment = !!(ur as any).attachment_data;
                  return (
                    <div key={ur.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                      {isExpired
                        ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        : <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{req.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[req.type]}</Badge>
                          {ur.expires_at && (
                            <span className={`text-xs flex items-center gap-1 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
                              <Clock className="h-3 w-3" />
                              {isExpired ? 'Utgånget' : `Utgår ${new Date(ur.expires_at).toLocaleDateString('sv-SE')}`}
                            </span>
                          )}
                          {hasAttachment && (
                            <button
                              onClick={() => handleDownload(ur as any)}
                              className="text-xs flex items-center gap-1 text-primary hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              {(ur as any).attachment_name}
                            </button>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(ur)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {availableReqs.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-sm font-medium">Registrera nytt krav</Label>
              <div className="flex gap-2">
                <Select value={addReqId} onValueChange={setAddReqId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Välj krav" /></SelectTrigger>
                  <SelectContent>
                    {availableReqs.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({TYPE_LABELS[r.type]})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAdd} disabled={!addReqId} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bifoga intyg/certifikat (valfritt, max 5 MB)</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileSelect}
                    className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                  {attachmentFile && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Paperclip className="h-3 w-3" />
                      {attachmentFile.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
