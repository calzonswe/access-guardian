import { FileText, Users, Building2, Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types/rbac';
import * as store from '@/services/dataStore';
import { StatCard } from '@/components/dashboard/StatCard';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';

export default function Dashboard() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  const applications = store.getApplications();
  const users = store.getUsers();
  const facilities = store.getFacilities();
  const roles = currentUser.roles;

  const pendingApps = applications.filter(a =>
    a.status === 'pending_manager' || a.status === 'pending_facility' || a.status === 'pending_exception'
  );
  const approvedApps = applications.filter(a => a.status === 'approved');

  // Gather all relevant sections based on ALL roles
  const sections: React.ReactNode[] = [];

  // Admin stats
  if (roles.includes('administrator')) {
    sections.push(
      <div key="admin-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Totalt användare" value={users.length} icon={Users} variant="primary" />
        <StatCard title="Anläggningar" value={facilities.length} icon={Building2} variant="default" />
        <StatCard title="Väntande ansökningar" value={pendingApps.length} icon={Clock} variant="warning" />
        <StatCard title="Godkända tillträden" value={approvedApps.length} icon={CheckCircle} variant="success" />
      </div>
    );
    sections.push(<ApplicationTable key="admin-apps" applications={applications} title="Alla ansökningar" />);
  }

  // Facility owner/admin stats
  if (roles.includes('facility_owner') || roles.includes('facility_admin')) {
    const myFacilities = facilities.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id));
    const myFacilityIds = myFacilities.map(f => f.id);
    const myApps = applications.filter(a => myFacilityIds.includes(a.facility_id));
    const myPending = myApps.filter(a => a.status === 'pending_facility' || a.status === 'pending_exception');
    const exceptions = myApps.filter(a => a.has_exception && a.status === 'pending_exception');

    if (!roles.includes('administrator')) {
      sections.push(
        <div key="facility-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Mina anläggningar" value={myFacilities.length} icon={Building2} variant="primary" />
          <StatCard title="Väntande granskning" value={myPending.length} icon={Clock} variant="warning" />
          <StatCard title="Väntande avsteg" value={exceptions.length} icon={AlertTriangle} variant="destructive" />
          <StatCard title="Aktiva tillträden" value={myApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
        </div>
      );
    }
    if (exceptions.length > 0) {
      sections.push(<ApplicationTable key="facility-exceptions" applications={exceptions} title="Avsteg som kräver godkännande" />);
    }
    if (myPending.length > 0 && !roles.includes('administrator')) {
      sections.push(<ApplicationTable key="facility-pending" applications={myPending} title="Ansökningar att granska" />);
    }
  }

  // Line manager stats
  if (roles.includes('line_manager')) {
    const allUsers = store.getUsers();
    const teamMembers = getSubordinates(currentUser.id, allUsers);
    const teamIds = teamMembers.map(u => u.id);
    const teamApps = applications.filter(a => teamIds.includes(a.applicant_id));
    const pendingMyApproval = teamApps.filter(a => a.status === 'pending_manager');

    if (!roles.includes('administrator')) {
      sections.push(
        <div key="manager-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Teammedlemmar" value={teamMembers.length} icon={Users} variant="primary" />
          <StatCard title="Väntar på mitt godkännande" value={pendingMyApproval.length} icon={Clock} variant="warning" />
          <StatCard title="Godkända" value={teamApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
        </div>
      );
    }
    if (pendingMyApproval.length > 0) {
      sections.push(<ApplicationTable key="manager-pending" applications={pendingMyApproval} title="Ansökningar att godkänna" />);
    }
  }

  // Employee/contractor stats
  if (roles.includes('employee') || roles.includes('contractor')) {
    const myApps = applications.filter(a => a.applicant_id === currentUser.id);
    const requirements = store.getRequirements();
    const myReqs = store.getUserRequirements(currentUser.id).filter(ur => ur.status === 'fulfilled');

    if (!roles.includes('administrator') && !roles.includes('line_manager')) {
      sections.push(
        <div key="employee-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Mina ansökningar" value={myApps.length} icon={FileText} variant="primary" />
          <StatCard title="Godkänt tillträde" value={myApps.filter(a => a.status === 'approved').length} icon={CheckCircle} variant="success" />
          <StatCard title="Uppfyllda krav" value={myReqs.length} subtitle={`av ${requirements.length} totalt`} icon={Shield} variant="default" />
        </div>
      );
    }
    if (myApps.length > 0 && !roles.includes('administrator')) {
      sections.push(<ApplicationTable key="employee-apps" applications={myApps} title="Mina ansökningar" />);
    }
  }

  const roleLabels = currentUser.roles.map(r => ROLE_LABELS[r]).join(', ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Välkommen, {currentUser.full_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {roleLabels} · {new Date().toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      {sections}
    </div>
  );
}

// Helper: get all subordinates at all levels
function getSubordinates(managerId: string, allUsers: ReturnType<typeof store.getUsers>): ReturnType<typeof store.getUsers> {
  const direct = allUsers.filter(u => u.manager_id === managerId || u.contact_person_id === managerId);
  const all = [...direct];
  for (const d of direct) {
    const subs = getSubordinates(d.id, allUsers);
    for (const s of subs) {
      if (!all.find(a => a.id === s.id)) all.push(s);
    }
  }
  return all;
}
