import { Shield, Plus, Clock, Award, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MOCK_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';

const TYPE_LABELS: Record<string, string> = {
  certification: 'Certifiering',
  clearance: 'Säkerhetsprövning',
  training: 'Utbildning',
};

const TYPE_ICONS: Record<string, typeof Award> = {
  certification: Award,
  clearance: Lock,
  training: Shield,
};

export default function RequirementsPage() {
  const { activeRole } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Krav</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera certifieringar, utbildningar och säkerhetsprövningar</p>
        </div>
        {activeRole === 'administrator' && (
          <Button><Plus className="mr-2 h-4 w-4" />Nytt krav</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Krav</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead>Giltighetstid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_REQUIREMENTS.map(req => {
                const Icon = TYPE_ICONS[req.type] || Shield;
                return (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium">{req.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[req.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{req.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.has_expiry ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {req.validity_days} dagar
                        </div>
                      ) : (
                        <span className="text-success">Permanent</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
