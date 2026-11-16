import * as store from '@/services/dataStore';
import type { Application, ApplicationStatus } from '@/types/rbac';
import { toast } from 'sonner';
import { t } from '@/i18n';

function simulateEmail(to: string, subject: string) {
  console.log(t('[E-post] Till: {to} | Ämne: {subject}', { to, subject }));
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
  // The backend creates notifications (and sends real e-mail) for every status
  // change; this client-side simulation is only for localStorage mode.
  if (store.isApiMode()) return;
  const applicant = store.getUser(application.applicant_id);
  const facility = store.getFacility(application.facility_id);
  const actor = store.getUser(actorId);
  const facilityName = facility?.name ?? t('okänd anläggning');
  const actorName = actor?.full_name ?? t('Systemet');

  // Notify applicant
  if (application.applicant_id !== actorId) {
    if (newStatus === 'approved') {
      store.createNotification({
        user_id: application.applicant_id,
        title: t('Ansökan godkänd'),
        message: t('Din ansökan om tillträde till {facilityName} har godkänts av {actorName}.', { facilityName, actorName }),
        type: 'info',
        read: false,
        link: '/applications',
      });
      if (applicant?.email) simulateEmail(applicant.email, t('Ansökan godkänd – {facilityName}', { facilityName }));
    } else if (newStatus === 'denied') {
      store.createNotification({
        user_id: application.applicant_id,
        title: t('Ansökan nekad'),
        message: t('Din ansökan om tillträde till {facilityName} har nekats av {actorName}.', { facilityName, actorName }),
        type: 'warning',
        read: false,
        link: '/applications',
      });
      if (applicant?.email) simulateEmail(applicant.email, t('Ansökan nekad – {facilityName}', { facilityName }));
    } else if (newStatus === 'pending_facility' || newStatus === 'pending_exception') {
      store.createNotification({
        user_id: application.applicant_id,
        title: t('Ansökan attesterad av chef'),
        message: t('Din ansökan om tillträde till {facilityName} har attesterats och skickats vidare.', { facilityName }),
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
          title: t('Ny ansökan att granska'),
          message: t('{v0} har ansökt om tillträde till {facilityName}.{v2}', { v0: applicant?.full_name ?? 'En användare', facilityName, v2: newStatus === 'pending_exception' ? ' Ansökan innehåller avsteg.' : '' }),
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
        title: t('Ny ansökan att attestera'),
        message: t('{v0} har skickat en tillträdesansökan till {facilityName} som väntar på din attestering.', { v0: applicant?.full_name ?? 'En användare', facilityName }),
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
      title: t('Tillträde återkallat'),
      message: t('Ditt tillträde till {facilityName} har återkallats av {actorName}.', { facilityName, actorName }),
      type: 'warning',
      read: false,
      link: '/applications',
    });
  }
}
