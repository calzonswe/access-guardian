import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import * as store from '@/services/dataStore';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';
import { ApplicationFormDialog } from '@/components/applications/ApplicationFormDialog';
import { ApplicationDetailDialog } from '@/components/applications/ApplicationDetailDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Application } from '@/types/rbac';

export default function ApplicationsPage() {
  const { currentUser, activeRole } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [, setRefresh] = useState(0);

  if (!currentUser) return null;

  const reload = () => setRefresh(n => n + 1);

  let applications = store.getApplications();

  if (activeRole === 'employee' || activeRole === 'contractor') {
    applications = applications.filter(a => a.applicant_id === currentUser.id);
  } else if (activeRole === 'line_manager') {
    const users = store.getUsers();
    const teamIds = users.filter(u => u.manager_id === currentUser.id || u.contact_person_id === currentUser.id).map(u => u.id);
    applications = applications.filter(a => teamIds.includes(a.applicant_id));
  } else if (activeRole === 'facility_owner' || activeRole === 'facility_admin') {
    const facilities = store.getFacilities();
    const myFacilityIds = facilities.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id)).map(f => f.id);
    applications = applications.filter(a => myFacilityIds.includes(a.facility_id));
  }

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
        {(activeRole === 'employee' || activeRole === 'contractor') && (
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
