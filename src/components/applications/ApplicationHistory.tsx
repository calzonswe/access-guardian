import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import * as api from '@/services/api';
import * as store from '@/services/dataStore';
import type { HistoryEntry } from '@/services/api';
import { t, locale } from '@/i18n';

/** Swedish labels for the audit actions an application can have. */
export const HISTORY_LABELS: Record<string, string> = {
  application_created: t('Ansökan skapad'),
  application_pending_manager: t('Skickad till chef för attest'),
  application_pending_facility: t('Godkänd av chef, skickad till anläggningen'),
  application_pending_exception: t('Godkänd av chef, avsteg skickat till anläggningsägaren'),
  application_approved: t('Godkänd'),
  application_denied: t('Nekad'),
  application_draft: t('Tillbaka till utkast'),
  application_updated: t('Ansökan ändrad'),
  access_revoked: t('Tillträde återkallat'),
  access_expired: t('Tillträdet gick ut'),
  attachment_uploaded: t('Bilaga uppladdad'),
  attachment_deleted: t('Bilaga borttagen'),
};

/** Only the human-readable part of a log detail (drops 'Status: a → b'). */
function detailText(e: HistoryEntry): string | null {
  if (!e.details) return null;
  const reason = /\(([^)]+)\)\s*$/.exec(e.details);
  if (reason) return reason[1];
  if (e.action === 'attachment_uploaded') return e.details.replace(/^Ansökan: [^,]+, fil: /, '');
  if (e.details.startsWith('Status:') || e.details.startsWith('Anläggning:')) return null;
  return e.details;
}

/** Timeline of what happened to one application (API mode). */
export function ApplicationHistory({ applicationId }: { applicationId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!store.isApiMode()) return;
    let cancelled = false;
    setEntries(null); setError('');
    api.getApplicationHistory(applicationId)
      .then(rows => { if (!cancelled) setEntries(rows); })
      .catch(() => { if (!cancelled) setError(t('Historiken kunde inte hämtas')); });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (!store.isApiMode()) return null;

  return (
    <section aria-labelledby={`history-${applicationId}`} className="space-y-2">
      <h3 id={`history-${applicationId}`} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('Historik')}
      </h3>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!entries && !error && <p className="text-xs text-muted-foreground">{t('Laddar…')}</p>}
      {entries && entries.length === 0 && <p className="text-xs text-muted-foreground">{t('Ingen historik ännu.')}</p>}
      {entries && entries.length > 0 && (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {entries.map(e => {
            const detail = detailText(e);
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                <p className="text-sm text-foreground">{HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}
                  {e.actor_name ? ` · ${e.actor_name}` : ''}
                </p>
                {detail && <p className="mt-0.5 text-xs text-foreground/80">{detail}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
