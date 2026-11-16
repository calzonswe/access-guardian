import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { RequirementCheck } from '@/lib/requirements';

const STATE = {
  fulfilled: { icon: CheckCircle2, className: 'text-success', label: 'Uppfyllt' },
  expires: { icon: AlertTriangle, className: 'text-warning', label: 'Går ut' },
  missing: { icon: XCircle, className: 'text-destructive', label: 'Saknas' },
} as const;

/** List of requirements with fulfilled / expiring / missing status. */
export function RequirementChecklist({ checks, emptyText = 'Inga krav för det valda.' }: { checks: RequirementCheck[]; emptyText?: string }) {
  if (checks.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-1.5" aria-label="Krav">
      {checks.map(({ requirement, state, expiresAt }) => {
        const s = STATE[state];
        return (
          <li key={requirement.id} className="flex items-start gap-2 text-sm">
            <s.icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.className}`} aria-hidden="true" />
            <span className="flex-1 text-foreground">{requirement.name}</span>
            <span className={`shrink-0 text-xs ${s.className}`}>
              {state === 'expires' && expiresAt ? `Går ut ${expiresAt}` : s.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
