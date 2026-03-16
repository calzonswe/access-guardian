import { Shield, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/dashboard/StatCard';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';

export default function MyAccessPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  const applications = store.getApplications();
  const requirements = store.getRequirements();
  const facilities = store.getFacilities();
  const areas = store.getAreas();
  const userReqs = store.getUserRequirements(currentUser.id);

  const myApps = applications.filter(a => a.applicant_id === currentUser.id);
  const activeAccess = myApps.filter(a => a.status === 'approved');
  const pendingApps = myApps.filter(a => a.status.startsWith('pending'));
  const fulfilledReqs = userReqs.filter(ur => ur.status === 'fulfilled');
  const totalReqs = requirements.length;
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

      <Card>
        <CardHeader><CardTitle className="text-lg">Kravuppfyllnad</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-sm font-medium text-foreground">{progressPct}%</span>
          </div>
          {requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Inga krav definierade i systemet</p>
          ) : (
            <div className="grid gap-2">
              {requirements.map(req => {
                const userReq = userReqs.find(ur => ur.requirement_id === req.id);
                const isFulfilled = userReq?.status === 'fulfilled';
                const isExpiring = userReq?.expires_at && new Date(userReq.expires_at) < new Date(Date.now() + 30 * 86400000);
                return (
                  <div key={req.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      {isFulfilled ? <CheckCircle className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                      <div><p className="text-sm font-medium text-foreground">{req.name}</p><p className="text-xs text-muted-foreground">{req.description}</p></div>
                    </div>
                    <Badge variant="outline" className={isFulfilled ? (isExpiring ? 'status-badge-pending' : 'status-badge-approved') : 'status-badge-denied'}>
                      {isFulfilled ? (isExpiring ? 'Utgår snart' : 'Uppfyllt') : 'Saknas'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Aktiva tillträden</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anläggning</TableHead>
                <TableHead>Områden</TableHead>
                <TableHead>Startdatum</TableHead>
                <TableHead>Slutdatum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeAccess.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Inga aktiva tillträden</TableCell></TableRow>
              ) : (
                activeAccess.map(app => {
                  const facility = facilities.find(f => f.id === app.facility_id);
                  const appAreas = areas.filter(a => app.area_ids.includes(a.id));
                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{facility?.name ?? '–'}</TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{appAreas.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>)}</div></TableCell>
                      <TableCell className="text-muted-foreground">{app.start_date}</TableCell>
                      <TableCell className="text-muted-foreground">{app.end_date ?? 'Tillsvidare'}</TableCell>
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
