import { useAuth } from '@/context/AuthContext';
import { MOCK_APPLICATIONS, MOCK_FACILITIES, MOCK_USERS } from '@/data/mock-data';
import { ApplicationTable } from '@/components/dashboard/ApplicationTable';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function ApplicationsPage() {
  const { currentUser, activeRole } = useAuth();

  let applications = MOCK_APPLICATIONS;

  if (activeRole === 'employee' || activeRole === 'contractor') {
    applications = applications.filter(a => a.applicant_id === currentUser.id);
  } else if (activeRole === 'line_manager') {
    const teamIds = MOCK_USERS.filter(u => u.manager_id === currentUser.id || u.contact_person_id === currentUser.id).map(u => u.id);
    applications = applications.filter(a => teamIds.includes(a.applicant_id));
  } else if (activeRole === 'facility_owner' || activeRole === 'facility_admin') {
    const myFacilityIds = MOCK_FACILITIES.filter(f => f.owner_id === currentUser.id || f.admin_ids.includes(currentUser.id)).map(f => f.id);
    applications = applications.filter(a => myFacilityIds.includes(a.facility_id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ansökningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera tillträdesansökningar</p>
        </div>
        {(activeRole === 'employee' || activeRole === 'contractor') && (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Ny ansökan
          </Button>
        )}
      </div>
      <ApplicationTable applications={applications} />
    </div>
  );
}
