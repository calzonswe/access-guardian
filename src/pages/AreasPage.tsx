import { MapPin, Shield, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MOCK_AREAS, MOCK_FACILITIES, MOCK_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';

const SECURITY_COLORS: Record<string, string> = {
  low: 'bg-success/10 text-success border-success/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  critical: 'bg-destructive text-destructive-foreground',
};

const SECURITY_LABELS: Record<string, string> = {
  low: 'Låg',
  medium: 'Medel',
  high: 'Hög',
  critical: 'Kritisk',
};

export default function AreasPage() {
  const { activeRole } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Områden</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera områden inom anläggningar</p>
        </div>
        {activeRole === 'administrator' && (
          <Button><Plus className="mr-2 h-4 w-4" />Nytt område</Button>
        )}
      </div>

      {MOCK_FACILITIES.map(facility => {
        const areas = MOCK_AREAS.filter(a => a.facility_id === facility.id);
        if (areas.length === 0) return null;
        return (
          <Card key={facility.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {facility.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Område</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead>Säkerhetsnivå</TableHead>
                    <TableHead>Skapad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areas.map(area => (
                    <TableRow key={area.id}>
                      <TableCell className="font-medium">{area.name}</TableCell>
                      <TableCell className="text-muted-foreground">{area.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SECURITY_COLORS[area.security_level]}>
                          {SECURITY_LABELS[area.security_level]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{area.created_at}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
