import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, Inbox } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import type { Application, ApplicationStatus } from '@/types/rbac';
import * as store from '@/services/dataStore';

const STATUS_MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Utkast', className: 'status-badge-neutral' },
  pending_manager: { label: 'Väntar på chef', className: 'status-badge-pending' },
  pending_facility: { label: 'Väntar på anläggning', className: 'status-badge-pending' },
  pending_exception: { label: 'Avsteg – väntar', className: 'status-badge-pending' },
  approved: { label: 'Godkänd', className: 'status-badge-approved' },
  denied: { label: 'Nekad', className: 'status-badge-denied' },
  expired: { label: 'Utgången', className: 'status-badge-neutral' },
};

interface Props {
  applications: Application[];
  title?: string;
  onRowClick?: (app: Application) => void;
  /** Bulk selection: which rows get a checkbox, which are selected, and the toggle. */
  selectable?: (app: Application) => boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Extra content on the right of the card title (e.g. "Markera alla"). */
  headerAction?: React.ReactNode;
}

export function ApplicationTable({ applications, title = 'Ansökningar', onRowClick, selectable, selectedIds, onToggleSelect, headerAction }: Props) {
  const navigate = useNavigate();
  // Rows always open the application: the caller's handler, or the deep link.
  const open = (app: Application) => (onRowClick ? onRowClick(app) : navigate(`/applications/${app.id}`));
  const withSelection = !!(selectable && selectedIds && onToggleSelect);
  const selectBox = (app: Application, name: string) => {
    if (!withSelection) return null;
    if (!selectable!(app)) return <span className="inline-block h-4 w-4" aria-hidden="true" />;
    return (
      <Checkbox
        checked={selectedIds!.has(app.id)}
        onCheckedChange={() => onToggleSelect!(app.id)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        aria-label={`Markera ansökan från ${name}`}
      />
    );
  };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        {applications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-60" aria-hidden="true" />
            <p className="text-sm">Inga ansökningar att visa</p>
          </div>
        ) : (
          <>
          {/* Phones: one card per application instead of a squeezed table */}
          <ul className="space-y-2 md:hidden">
            {applications.map(app => {
              const user = store.getUser(app.applicant_id);
              const facility = store.getFacility(app.facility_id);
              const status = STATUS_MAP[app.status];
              return (
                <li key={app.id} className="flex items-center gap-2">
                  {selectBox(app, user?.full_name ?? 'okänd')}
                  <button
                    type="button"
                    onClick={() => open(app)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{facility?.name ?? '–'}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.full_name ?? '–'} · {app.start_date} – {app.end_date ?? 'tillsvidare'}</p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <Badge variant="outline" className={`whitespace-nowrap ${status.className}`}>
                          {app.status === 'expired' && app.revoked_at ? 'Återkallad' : status.label}
                        </Badge>
                        {app.has_exception && app.status !== 'pending_exception' && (
                          <Badge variant="outline" className="whitespace-nowrap status-badge-pending">Avsteg</Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {withSelection && <TableHead className="w-10"><span className="sr-only">Markera</span></TableHead>}
                <TableHead>Sökande</TableHead>
                <TableHead>Anläggning</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Startdatum</TableHead>
                <TableHead>Slutdatum</TableHead>
                <TableHead className="w-8"><span className="sr-only">Öppna</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map(app => {
                const user = store.getUser(app.applicant_id);
                const facility = store.getFacility(app.facility_id);
                const status = STATUS_MAP[app.status];
                return (
                  <TableRow
                    key={app.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    tabIndex={0}
                    role="button"
                    aria-label={`Öppna ansökan från ${user?.full_name ?? 'okänd'} till ${facility?.name ?? 'okänd anläggning'}`}
                    onClick={() => open(app)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(app); } }}
                  >
                    {withSelection && <TableCell className="w-10" onClick={e => e.stopPropagation()}>{selectBox(app, user?.full_name ?? 'okänd')}</TableCell>}
                    <TableCell className="font-medium">{user?.full_name ?? '–'}</TableCell>
                    <TableCell>{facility?.name ?? '–'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`whitespace-nowrap ${status.className}`}>
                        {app.status === 'expired' && app.revoked_at ? 'Återkallad' : status.label}
                      </Badge>
                      {app.has_exception && app.status !== 'pending_exception' && (
                        <Badge variant="outline" className="ml-1.5 whitespace-nowrap status-badge-pending" title="Ansökan innehåller avsteg från kraven">Avsteg</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{app.start_date}</TableCell>
                    <TableCell className="whitespace-nowrap">{app.end_date ?? 'Tillsvidare'}</TableCell>
                    <TableCell className="text-muted-foreground"><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
