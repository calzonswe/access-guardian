import { useState, useMemo } from 'react';
import { ScrollText, Download, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as store from '@/services/dataStore';
import { exportLogs } from '@/services/exportService';
import { toast } from 'sonner';

const ACTION_OPTIONS = [
  'all', 'application_created', 'application_approved_manager', 'application_approved_facility',
  'application_denied', 'access_granted', 'access_revoked', 'access_expired',
  'user_created', 'user_updated', 'role_assigned', 'role_removed',
  'requirement_created', 'facility_created', 'area_created',
];

const PAGE_SIZE = 50;

export default function LogsPage() {
  const allLogs = store.getLogs();
  const users = store.getUsers();
  const [filterAction, setFilterAction] = useState('all');
  const [filterActor, setFilterActor] = useState('');
  const [filterDetails, setFilterDetails] = useState('');
  const [page, setPage] = useState(1);

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (filterAction !== 'all' && log.action !== filterAction) return false;
      if (filterActor) {
        const actor = users.find(u => u.id === log.actor_id);
        const name = actor?.full_name || '';
        if (!name.toLowerCase().includes(filterActor.toLowerCase())) return false;
      }
      if (filterDetails && log.details && !log.details.toLowerCase().includes(filterDetails.toLowerCase())) return false;
      return true;
    });
  }, [allLogs, filterAction, filterActor, filterDetails, users]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Systemlogg</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredLogs.length} av {allLogs.length} poster
          </p>
        </div>
        {filteredLogs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { exportLogs(); toast.success('Logg exporterad'); }}>
            <Download className="mr-2 h-4 w-4" />Exportera
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filtrera</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla händelser</SelectItem>
                {ACTION_OPTIONS.filter(o => o !== 'all').map(a => (
                  <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrera på användare..."
              value={filterActor}
              onChange={e => { setFilterActor(e.target.value); setPage(1); }}
            />
            <Input
              placeholder="Filtrera på detaljer..."
              value={filterDetails}
              onChange={e => { setFilterDetails(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {paginatedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Inga loggposter matchar filtret</p>
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
                {paginatedLogs.map(log => {
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Föregående</Button>
          <span className="text-sm text-muted-foreground">Sida {page} av {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Nästa</Button>
        </div>
      )}
    </div>
  );
}
