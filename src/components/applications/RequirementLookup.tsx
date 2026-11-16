import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import * as store from '@/services/dataStore';
import { checkRequirements } from '@/lib/requirements';
import { RequirementChecklist } from '@/components/applications/RequirementChecklist';

/** "Vad krävs?": pick a facility and areas, see which requirements you meet. */
export function RequirementLookup({ userId }: { userId: string }) {
  const [facilityId, setFacilityId] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const facilities = store.getFacilities();
  const areas = facilityId ? store.getAreas(facilityId) : [];

  // An area includes the areas above it, like in the application form.
  const withAncestors = (ids: string[]) => {
    const out = new Set(ids);
    for (const id of ids) {
      let cur = areas.find(a => a.id === id)?.parent_id;
      while (cur) { out.add(cur); cur = areas.find(a => a.id === cur)?.parent_id; }
    }
    return [...out];
  };
  const checks = checkRequirements(userId, facilityId, withAncestors(areaIds));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Vad krävs?</CardTitle>
        <CardDescription>Se vilka krav som gäller innan du ansöker, och vilka du redan uppfyller.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="req-lookup-facility">Anläggning</Label>
          <Select value={facilityId} onValueChange={v => { setFacilityId(v); setAreaIds([]); }}>
            <SelectTrigger id="req-lookup-facility"><SelectValue placeholder="Välj anläggning" /></SelectTrigger>
            <SelectContent>{facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {areas.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Områden (valfritt)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {areas.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={areaIds.includes(a.id)}
                    onCheckedChange={c => setAreaIds(prev => c ? [...prev, a.id] : prev.filter(x => x !== a.id))}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {facilityId && <RequirementChecklist checks={checks} emptyText="Inga krav för det valda." />}
      </CardContent>
    </Card>
  );
}
