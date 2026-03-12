import { ScrollText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MOCK_LOGS, MOCK_USERS } from '@/data/mock-data';

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Systemlogg</h1>
        <p className="text-sm text-muted-foreground mt-1">Spårning av alla händelser i systemet</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tid</TableHead>
                <TableHead>Användare</TableHead>
                <TableHead>Händelse</TableHead>
                <TableHead>Detaljer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_LOGS.map(log => {
                const actor = MOCK_USERS.find(u => u.id === log.actor_id);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell className="font-medium">{actor?.full_name ?? '–'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.action.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
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
