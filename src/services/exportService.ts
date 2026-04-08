import * as store from '@/services/dataStore';
import { ROLE_LABELS } from '@/types/rbac';

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
  const headers = ['Namn', 'E-post', 'Befattning', 'Avdelning/Företag', 'Roller', 'Status', 'Skapad'];
  const rows = users.map(u => [
    u.full_name,
    u.email,
    u.title || '',
    u.company || u.department || '',
    u.roles.map(r => ROLE_LABELS[r]).join(', '),
    u.is_active ? 'Aktiv' : 'Inaktiv',
    new Date(u.created_at).toLocaleDateString('sv-SE'),
  ]);
  downloadCsv(`användare_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

export function exportApplications(): void {
  const apps = store.getApplications();
  const users = store.getUsers();
  const facilities = store.getFacilities();
  const STATUS_LABELS: Record<string, string> = {
    draft: 'Utkast', pending_manager: 'Väntar chef', pending_facility: 'Väntar anläggning',
    pending_exception: 'Avsteg', approved: 'Godkänd', denied: 'Nekad', expired: 'Utgången',
  };
  const headers = ['Sökande', 'Anläggning', 'Status', 'Startdatum', 'Slutdatum', 'Avsteg', 'Skapad'];
  const rows = apps.map(a => [
    users.find(u => u.id === a.applicant_id)?.full_name || '',
    facilities.find(f => f.id === a.facility_id)?.name || '',
    STATUS_LABELS[a.status] || a.status,
    a.start_date,
    a.end_date || 'Tillsvidare',
    a.has_exception ? 'Ja' : 'Nej',
    new Date(a.created_at).toLocaleDateString('sv-SE'),
  ]);
  downloadCsv(`ansökningar_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

export function exportRequirementsFulfillment(): void {
  const users = store.getUsers();
  const allReqs = store.getRequirements();
  const allUserReqs = store.getUserRequirements();
  const headers = ['Användare', 'Krav', 'Typ', 'Status', 'Uppfyllt datum', 'Utgår'];
  const rows: string[][] = [];
  for (const ur of allUserReqs) {
    const user = users.find(u => u.id === ur.user_id);
    const req = allReqs.find(r => r.id === ur.requirement_id);
    const isExpired = ur.expires_at && new Date(ur.expires_at) < new Date();
    rows.push([
      user?.full_name || '',
      req?.name || '',
      req?.type || '',
      isExpired ? 'Utgången' : ur.status,
      new Date(ur.fulfilled_at).toLocaleDateString('sv-SE'),
      ur.expires_at ? new Date(ur.expires_at).toLocaleDateString('sv-SE') : '',
    ]);
  }
  downloadCsv(`kravuppfyllnad_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

export function exportLogs(): void {
  const logs = store.getLogs();
  const users = store.getUsers();
  const headers = ['Tidpunkt', 'Åtgärd', 'Utförd av', 'Detaljer'];
  const rows = logs.map(l => [
    new Date(l.created_at).toLocaleString('sv-SE'),
    l.action,
    users.find(u => u.id === l.actor_id)?.full_name || l.actor_id,
    l.details,
  ]);
  downloadCsv(`systemlogg_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}
