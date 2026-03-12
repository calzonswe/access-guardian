import { Users, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { MOCK_USERS, MOCK_APPLICATIONS, MOCK_USER_REQUIREMENTS, MOCK_REQUIREMENTS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';

export default function TeamPage() {
  const { currentUser } = useAuth();

  const teamMembers = MOCK_USERS.filter(
    u => u.manager_id === currentUser.id || u.contact_person_id === currentUser.id
  );
  const teamIds = teamMembers.map(u => u.id);
  const teamApps = MOCK_APPLICATIONS.filter(a => teamIds.includes(a.applicant_id));
  const pendingApps = teamApps.filter(a => a.status === 'pending_manager');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Mitt team</h1>
        <p className="text-sm text-muted-foreground mt-1">Översikt av ditt teams tillträdesrättigheter</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Teammedlemmar" value={teamMembers.length} icon={Users} variant="primary" />
        <StatCard title="Väntar på godkännande" value={pendingApps.length} icon={AlertTriangle} variant="warning" />
        <StatCard title="Aktiva tillträden" value={teamApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teammedlemmar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead>Uppfyllda krav</TableHead>
                <TableHead>Aktiva tillträden</TableHead>
                <TableHead>Väntande ansökningar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Inga teammedlemmar
                  </TableCell>
                </TableRow>
              ) : (
                teamMembers.map(member => {
                  const userReqs = MOCK_USER_REQUIREMENTS.filter(ur => ur.user_id === member.id && ur.status === 'fulfilled');
                  const memberApps = MOCK_APPLICATIONS.filter(a => a.applicant_id === member.id);
                  const activeAccess = memberApps.filter(a => a.status === 'approved').length;
                  const pending = memberApps.filter(a => a.status === 'pending_manager' || a.status === 'pending_facility').length;

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.roles.map(r => (
                            <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          {userReqs.length} / {MOCK_REQUIREMENTS.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={activeAccess > 0 ? 'status-badge-approved' : ''}>
                          {activeAccess}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pending > 0 ? (
                          <Badge variant="outline" className="status-badge-pending">{pending}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">0</span>
                        )}
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
