import * as store from '@/services/dataStore';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { toast } from 'sonner';

function simulateEmail(to: string, subject: string) {
  console.log(`[E-post] Till: ${to} | Ämne: ${subject}`);
  toast.info(`📧 E-post skickad till ${to}`, { description: subject, duration: 4000 });
}

/**
 * Creates automatic notifications when application status changes.
 */
export function notifyApplicationStatusChange(
  application: Application,
  newStatus: ApplicationStatus,
  actorId: string
): void {
  const applicant = store.getUser(application.applicant_id);
  const facility = store.getFacility(application.facility_id);
  const actor = store.getUser(actorId);
  const facilityName = facility?.name ?? 'okänd anläggning';
  const actorName = actor?.full_name ?? 'Systemet';

  // Notify applicant
  if (application.applicant_id !== actorId) {
    if (newStatus === 'approved') {
      store.createNotification({
        user_id: application.applicant_id,
        title: 'Ansökan godkänd',
        message: `Din ansökan om tillträde till ${facilityName} har godkänts av ${actorName}.`,
        type: 'info',
        read: false,
        link: '/applications',
      });
    } else if (newStatus === 'denied') {
      store.createNotification({
        user_id: application.applicant_id,
        title: 'Ansökan nekad',
        message: `Din ansökan om tillträde till ${facilityName} har nekats av ${actorName}.`,
        type: 'warning',
        read: false,
        link: '/applications',
      });
    } else if (newStatus === 'pending_facility' || newStatus === 'pending_exception') {
      store.createNotification({
        user_id: application.applicant_id,
        title: 'Ansökan attesterad av chef',
        message: `Din ansökan om tillträde till ${facilityName} har attesterats och skickats vidare.`,
        type: 'info',
        read: false,
        link: '/applications',
      });
    }
  }

  // Notify facility owner/admins when pending_facility or pending_exception
  if (newStatus === 'pending_facility' || newStatus === 'pending_exception') {
    if (facility) {
      const notifyIds = new Set<string>();
      if (facility.owner_id) notifyIds.add(facility.owner_id);
      facility.admin_ids?.forEach(id => notifyIds.add(id));
      notifyIds.delete(actorId); // Don't notify the actor
      
      notifyIds.forEach(userId => {
        store.createNotification({
          user_id: userId,
          title: 'Ny ansökan att granska',
          message: `${applicant?.full_name ?? 'En användare'} har ansökt om tillträde till ${facilityName}.${newStatus === 'pending_exception' ? ' Ansökan innehåller avsteg.' : ''}`,
          type: 'action_required',
          read: false,
          link: '/applications',
        });
      });
    }
  }

  // Notify manager when pending_manager (new application)
  if (newStatus === 'pending_manager') {
    const applicantUser = store.getUser(application.applicant_id);
    const managerId = applicantUser?.manager_id || applicantUser?.contact_person_id;
    if (managerId && managerId !== actorId) {
      store.createNotification({
        user_id: managerId,
        title: 'Ny ansökan att attestera',
        message: `${applicant?.full_name ?? 'En användare'} har skickat en tillträdesansökan till ${facilityName} som väntar på din attestering.`,
        type: 'action_required',
        read: false,
        link: '/applications',
      });
    }
  }

  // Notify on revocation
  if (newStatus === 'expired' && application.status === 'approved') {
    store.createNotification({
      user_id: application.applicant_id,
      title: 'Tillträde återkallat',
      message: `Ditt tillträde till ${facilityName} har återkallats av ${actorName}.`,
      type: 'warning',
      read: false,
      link: '/applications',
    });
  }
}
