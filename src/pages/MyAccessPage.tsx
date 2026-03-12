import { Shield, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/dashboard/StatCard';
import { MOCK_APPLICATIONS, MOCK_FACILITIES, MOCK_AREAS, MOCK_REQUIREMENTS, MOCK_USER_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';

export default function MyAccessPage() {
  const { currentUser } = useAuth();

  const myApps = MOCK_APPLICATIONS.filter(a => a.applicant_id === currentUser.id);
  const activeAccess = myApps.filter(a => a.status === 'approved');
  const pendingApps = myApps.filter(a => a.status.startsWith('pending'));
  const myReqs = MOCK_USER_REQUIREMENTS.filter(ur => ur.user_id === currentUser.id);
  const fulfilledReqs = myReqs.filter(ur => ur.status === 'fulfilled');
  const totalReqs = MOCK_REQUIREMENTS.length;
  const progressPct = totalReqs > 0 ? Math.round((fulfilledReqs.length / totalReqs) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Min åtkomst</h1>
        <p className="text-sm text-muted-foreground mt-1">Visa dina aktiva tillträden och kravuppfyllnad</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Aktiva tillträden" value={activeAccess.length} icon={CheckCircle} variant="success" />
        <StatCard title="Väntande ansökningar" value={pendingApps.length} icon={Clock} variant="warning" />
        <StatCard title="Uppfyllda krav" value={`${fulfilledReqs.length} / ${totalReqs}`} icon={Shield} variant="primary" />
      </div>

      {/* Requirements progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kravuppfyllnad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-sm font-medium text-foreground">{progressPct}%</span>
          </div>
          <div className="grid gap-2">
            {MOCK_REQUIREMENTS.map(req => {
              const userReq = myReqs.find(ur => ur.requirement_id === req.id);
              const isFulfilled = userReq?.status === 'fulfilled';
              const isExpiring = userReq?.expires_at && new Date(userReq.expires_at) < new Date(Date.now() + 30 * 86400000);

              return (
                <div key={req.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    {isFulfilled ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{req.name}</p>
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isFulfilled ? (
                      <Badge variant="outline" className={isExpiring ? 'status-badge-pending' : 'status-badge-approved'}>
                        {isExpiring ? 'Utgår snart' : 'Uppfyllt'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="status-badge-denied">Saknas</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active access */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aktiva tillträden</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anläggning</TableHead>
                <TableHead>Områden</TableHead>
                <TableHead>Startdatum</TableHead>
                <TableHead>Slutdatum</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeAccess.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Inga aktiva tillträden
                  </TableCell>
                </TableRow>
              ) : (
                activeAccess.map(app => {
                  const facility = MOCK_FACILITIES.find(f => f.id === app.facility_id);
                  const areas = MOCK_AREAS.filter(a => app.area_ids.includes(a.id));
                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{facility?.name ?? '–'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {areas.map(a => (
                            <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{app.start_date}</TableCell>
                      <TableCell className="text-muted-foreground">{app.end_date ?? 'Tillsvidare'}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">Förläng</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
