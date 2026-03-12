import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { MOCK_USERS, MOCK_FACILITIES } from '@/data/mock-data';

const STATUS_MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Utkast', className: 'bg-muted text-muted-foreground' },
  pending_manager: { label: 'Väntar på chef', className: 'status-badge-pending' },
  pending_facility: { label: 'Väntar på anläggning', className: 'status-badge-pending' },
  pending_exception: { label: 'Avsteg – väntar', className: 'bg-warning/10 text-warning border border-warning/20' },
  approved: { label: 'Godkänd', className: 'status-badge-approved' },
  denied: { label: 'Nekad', className: 'status-badge-denied' },
  expired: { label: 'Utgången', className: 'bg-muted text-muted-foreground' },
};

interface Props {
  applications: Application[];
  title?: string;
}

export function ApplicationTable({ applications, title = 'Ansökningar' }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Inga ansökningar att visa</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sökande</TableHead>
                <TableHead>Anläggning</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Startdatum</TableHead>
                <TableHead>Slutdatum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map(app => {
                const user = MOCK_USERS.find(u => u.id === app.applicant_id);
                const facility = MOCK_FACILITIES.find(f => f.id === app.facility_id);
                const status = STATUS_MAP[app.status];
                return (
                  <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{user?.full_name ?? '–'}</TableCell>
                    <TableCell>{facility?.name ?? '–'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                        {app.has_exception && ' ⚠'}
                      </Badge>
                    </TableCell>
                    <TableCell>{app.start_date}</TableCell>
                    <TableCell>{app.end_date ?? 'Tillsvidare'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
