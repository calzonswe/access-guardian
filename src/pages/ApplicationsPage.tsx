import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import * as store from '@/services/dataStore';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';
import { ApplicationFormDialog } from '@/components/applications/ApplicationFormDialog';
import { ApplicationDetailDialog } from '@/components/applications/ApplicationDetailDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Application } from '@/types/rbac';

function getSubordinateIds(managerId: string, users: ReturnType<typeof store.getUsers>): string[] {
  const direct = users.filter(u => u.manager_id === managerId || u.contact_person_id === managerId);
  const ids = direct.map(u => u.id);
  for (const d of direct) {
    const subIds = getSubordinateIds(d.id, users);
    for (const id of subIds) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export default function ApplicationsPage() {
  const { currentUser } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [, setRefresh] = useState(0);

  if (!currentUser) return null;

  const reload = () => setRefresh(n => n + 1);
  const roles = currentUser.roles;

  let applications = store.getApplications();

  // Filter based on ALL roles combined
  if (roles.includes('administrator')) {
    // Admin sees everything - no filter
  } else {
    const visibleIds = new Set<string>();

    // Own applications (employee/contractor)
    if (roles.includes('employee') || roles.includes('contractor')) {
      applications.filter(a => a.applicant_id === currentUser.id).forEach(a => visibleIds.add(a.id));
    }

    // Team applications (line_manager)
    if (roles.includes('line_manager')) {
      const users = store.getUsers();
      const teamIds = getSubordinateIds(currentUser.id, users);
      applications.filter(a => teamIds.includes(a.applicant_id)).forEach(a => visibleIds.add(a.id));
    }

    // Facility applications (facility_owner/admin)
    if (roles.includes('facility_owner') || roles.includes('facility_admin')) {
      const facilities = store.getFacilities();
      const myFacilityIds = facilities.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id)).map(f => f.id);
      applications.filter(a => myFacilityIds.includes(a.facility_id)).forEach(a => visibleIds.add(a.id));
    }

    applications = applications.filter(a => visibleIds.has(a.id));
  }

  const canCreateApplication = roles.includes('employee') || roles.includes('contractor');

  const handleDelete = (app: Application) => {
    if (confirm('Är du säker på att du vill ta bort denna ansökan?')) {
      store.deleteApplication(app.id);
      store.addLog({ action: 'application_created', actor_id: currentUser.id, target_id: app.id, target_type: 'application', details: `Ansökan borttagen` });
      setSelectedApp(null);
      reload();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ansökningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera tillträdesansökningar</p>
        </div>
        {canCreateApplication && (
          <Button onClick={() => { setEditApp(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Ny ansökan
          </Button>
        )}
      </div>
      <ApplicationTable applications={applications} onRowClick={setSelectedApp} />
      <ApplicationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editApplication={editApp}
        onSaved={reload}
      />
      <ApplicationDetailDialog
        application={selectedApp}
        open={!!selectedApp}
        onOpenChange={(open) => { if (!open) setSelectedApp(null); }}
        onUpdated={reload}
        onEdit={(app) => { setSelectedApp(null); setEditApp(app); setFormOpen(true); }}
        onDelete={handleDelete}
      />
    </div>
  );
}
