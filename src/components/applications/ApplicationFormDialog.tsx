import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { MOCK_FACILITIES, MOCK_AREAS, MOCK_REQUIREMENTS, MOCK_USER_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationFormDialog({ open, onOpenChange }: Props) {
  const { currentUser } = useAuth();
  const [facilityId, setFacilityId] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [justification, setJustification] = useState('');

  const facility = MOCK_FACILITIES.find(f => f.id === facilityId);
  const areas = facilityId ? MOCK_AREAS.filter(a => a.facility_id === facilityId) : [];

  // Check which requirements user is missing
  const userReqs = MOCK_USER_REQUIREMENTS.filter(ur => ur.user_id === currentUser.id && ur.status === 'fulfilled');
  const userReqIds = userReqs.map(ur => ur.requirement_id);
  const missingReqs = MOCK_REQUIREMENTS.filter(r => !userReqIds.includes(r.id));
  const hasException = missingReqs.length > 0;

  const toggleArea = (areaId: string) => {
    setSelectedAreas(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  const handleSubmit = () => {
    if (!facilityId || selectedAreas.length === 0 || !startDate) {
      toast.error('Fyll i alla obligatoriska fält');
      return;
    }
    if (hasException && !justification.trim()) {
      toast.error('Motivering krävs vid avsteg från krav');
      return;
    }
    toast.success('Ansökan skickad!');
    onOpenChange(false);
    setFacilityId('');
    setSelectedAreas([]);
    setStartDate('');
    setEndDate('');
    setJustification('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ny tillträdesansökan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Anläggning *</Label>
            <Select value={facilityId} onValueChange={(v) => { setFacilityId(v); setSelectedAreas([]); }}>
              <SelectTrigger>
                <SelectValue placeholder="Välj anläggning" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_FACILITIES.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {facilityId && (
            <div className="space-y-2">
              <Label>Områden *</Label>
              <div className="grid gap-2 rounded-lg border border-border p-3">
                {areas.map(area => (
                  <div key={area.id} className="flex items-center gap-2">
                    <Checkbox
                      id={area.id}
                      checked={selectedAreas.includes(area.id)}
                      onCheckedChange={() => toggleArea(area.id)}
                    />
                    <label htmlFor={area.id} className="text-sm cursor-pointer flex-1">
                      {area.name}
                      <span className="text-muted-foreground ml-2 text-xs">({area.description})</span>
                    </label>
                    <Badge variant="outline" className="text-[10px]">{area.security_level}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Startdatum *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Slutdatum</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Lämna tomt för tillsvidare</p>
            </div>
          </div>

          {hasException && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">Avsteg från krav</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Du saknar följande krav: {missingReqs.map(r => r.name).join(', ')}
              </p>
              <div className="space-y-1">
                <Label>Motivering för avsteg *</Label>
                <Textarea
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Beskriv varför du ska beviljas tillträde trots att krav saknas..."
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSubmit}>Skicka ansökan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
