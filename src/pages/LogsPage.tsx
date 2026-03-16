import { ScrollText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import * as store from '@/services/dataStore';

export default function LogsPage() {
  const logs = store.getLogs();
  const users = store.getUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Systemlogg</h1>
        <p className="text-sm text-muted-foreground mt-1">Spårning av alla händelser i systemet</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Inga loggposter ännu</p>
            </div>
          ) : (
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
                {logs.map(log => {
                  const actor = users.find(u => u.id === log.actor_id);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('sv-SE')}
                      </TableCell>
                      <TableCell className="font-medium">{actor?.full_name ?? '–'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{log.action.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
