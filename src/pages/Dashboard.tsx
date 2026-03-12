import { FileText, Users, Building2, Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import { MOCK_APPLICATIONS, MOCK_USERS, MOCK_FACILITIES } from '@/data/mock-data';
import { StatCard } from '@/components/dashboard/StatCard';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';

export default function Dashboard() {
  const { currentUser, activeRole } = useAuth();

  const pendingApps = MOCK_APPLICATIONS.filter(a =>
    a.status === 'pending_manager' || a.status === 'pending_facility' || a.status === 'pending_exception'
  );
  const approvedApps = MOCK_APPLICATIONS.filter(a => a.status === 'approved');

  const renderAdminDashboard = () => (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Totalt användare" value={MOCK_USERS.length} icon={Users} variant="primary" />
        <StatCard title="Anläggningar" value={MOCK_FACILITIES.length} icon={Building2} variant="default" />
        <StatCard title="Väntande ansökningar" value={pendingApps.length} icon={Clock} variant="warning" />
        <StatCard title="Godkända tillträden" value={approvedApps.length} icon={CheckCircle} variant="success" />
      </div>
      <ApplicationTable applications={MOCK_APPLICATIONS} title="Alla ansökningar" />
    </>
  );

  const renderFacilityDashboard = () => {
    const myFacilities = MOCK_FACILITIES.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id));
    const myFacilityIds = myFacilities.map(f => f.id);
    const myApps = MOCK_APPLICATIONS.filter(a => myFacilityIds.includes(a.facility_id));
    const myPending = myApps.filter(a => a.status === 'pending_facility' || a.status === 'pending_exception');
    const exceptions = myApps.filter(a => a.has_exception && a.status === 'pending_exception');

    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Mina anläggningar" value={myFacilities.length} icon={Building2} variant="primary" />
          <StatCard title="Väntande granskning" value={myPending.length} icon={Clock} variant="warning" />
          <StatCard title="Väntande avsteg" value={exceptions.length} icon={AlertTriangle} variant="destructive" />
          <StatCard title="Aktiva tillträden" value={myApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
        </div>
        {exceptions.length > 0 && (
          <ApplicationTable applications={exceptions} title="Avsteg som kräver godkännande" />
        )}
        <ApplicationTable applications={myPending} title="Ansökningar att granska" />
      </>
    );
  };

  const renderManagerDashboard = () => {
    const teamMembers = MOCK_USERS.filter(u => u.manager_id === currentUser.id || u.contact_person_id === currentUser.id);
    const teamIds = teamMembers.map(u => u.id);
    const teamApps = MOCK_APPLICATIONS.filter(a => teamIds.includes(a.applicant_id));
    const pendingMyApproval = teamApps.filter(a => a.status === 'pending_manager');

    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Teammedlemmar" value={teamMembers.length} icon={Users} variant="primary" />
          <StatCard title="Väntar på mitt godkännande" value={pendingMyApproval.length} icon={Clock} variant="warning" />
          <StatCard title="Godkända" value={teamApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
        </div>
        <ApplicationTable applications={pendingMyApproval} title="Ansökningar att godkänna" />
      </>
    );
  };

  const renderEmployeeDashboard = () => {
    const myApps = MOCK_APPLICATIONS.filter(a => a.applicant_id === currentUser.id);
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Mina ansökningar" value={myApps.length} icon={FileText} variant="primary" />
          <StatCard title="Godkänt tillträde" value={myApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
          <StatCard title="Uppfyllda krav" value={2} subtitle="av 5 totalt" icon={Shield} variant="default" />
        </div>
        <ApplicationTable applications={myApps} title="Mina ansökningar" />
      </>
    );
  };

  const getDashboard = () => {
    switch (activeRole) {
      case 'administrator': return renderAdminDashboard();
      case 'facility_owner':
      case 'facility_admin': return renderFacilityDashboard();
      case 'line_manager': return renderManagerDashboard();
      case 'employee':
      case 'contractor': return renderEmployeeDashboard();
      default: return renderEmployeeDashboard();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Välkommen, {currentUser.full_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Roll: {ROLE_LABELS[activeRole]} · {new Date().toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      {getDashboard()}
    </div>
  );
}
