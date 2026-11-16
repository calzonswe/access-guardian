import * as store from '@/services/dataStore';
import { ROLE_LABELS } from '@/types/rbac';
import { t, locale } from '@/i18n';

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const bom = '\uFEFF';
  const csv = bom + [headers.join(';'), ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportUsers(): void {
  const users = store.getUsers();
  const headers = [t('Namn'), 'E-post', t('Befattning'), t('Avdelning/Företag'), t('Roller'), t('Status'), t('Skapad')];
  const rows = users.map(u => [
    u.full_name,
    u.email,
    u.title || '',
    u.company || u.department || '',
    u.roles.map(r => ROLE_LABELS[r]).join(', '),
    u.is_active ? t('Aktiv') : t('Inaktiv'),
    new Date(u.created_at).toLocaleDateString(locale()),
  ]);
  downloadCsv(t('användare_{v0}.csv', { v0: new Date().toISOString().slice(0, 10) }), headers, rows);
}

export function exportApplications(): void {
  const apps = store.getApplications();
  const users = store.getUsers();
  const facilities = store.getFacilities();
  const STATUS_LABELS: Record<string, string> = {
    draft: t('Utkast'), pending_manager: t('Väntar chef'), pending_facility: t('Väntar anläggning'),
    pending_exception: t('Avsteg'), approved: t('Godkänd'), denied: t('Nekad'), expired: t('Utgången'),
  };
  const headers = [t('Sökande'), t('Anläggning'), t('Status'), t('Startdatum'), t('Slutdatum'), t('Avsteg'), t('Skapad')];
  const rows = apps.map(a => [
    users.find(u => u.id === a.applicant_id)?.full_name || '',
    facilities.find(f => f.id === a.facility_id)?.name || '',
    STATUS_LABELS[a.status] || a.status,
    a.start_date,
    a.end_date || t('Tillsvidare'),
    a.has_exception ? 'Ja' : t('Nej'),
    new Date(a.created_at).toLocaleDateString(locale()),
  ]);
  downloadCsv(t('ansökningar_{v0}.csv', { v0: new Date().toISOString().slice(0, 10) }), headers, rows);
}

export function exportRequirementsFulfillment(): void {
  const users = store.getUsers();
  const allReqs = store.getRequirements();
  const allUserReqs = store.getUserRequirements();
  const headers = [t('Användare'), t('Krav'), t('Typ'), t('Status'), t('Uppfyllt datum'), t('Utgår')];
  const rows: string[][] = [];
  for (const ur of allUserReqs) {
    const user = users.find(u => u.id === ur.user_id);
    const req = allReqs.find(r => r.id === ur.requirement_id);
    const isExpired = ur.expires_at && new Date(ur.expires_at) < new Date();
    rows.push([
      user?.full_name || '',
      req?.name || '',
      req?.type || '',
      isExpired ? t('Utgången') : ur.status,
      new Date(ur.fulfilled_at).toLocaleDateString(locale()),
      ur.expires_at ? new Date(ur.expires_at).toLocaleDateString(locale()) : '',
    ]);
  }
  downloadCsv(`kravuppfyllnad_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}
