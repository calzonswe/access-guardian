import { ScrollText, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import * as store from '@/services/dataStore';
import { exportLogs } from '@/services/exportService';
import { toast } from 'sonner';

export default function LogsPage() {
  const logs = store.getLogs();
  const users = store.getUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Systemlogg</h1>
          <p className="text-sm text-muted-foreground mt-1">Spårning av alla händelser i systemet</p>
        </div>
        {logs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { exportLogs(); toast.success('Logg exporterad'); }}>
            <Download className="mr-2 h-4 w-4" />Exportera
          </Button>
        )}
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
