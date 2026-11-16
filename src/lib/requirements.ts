import * as store from '@/services/dataStore';
import type { Requirement } from '@/types/rbac';
import { isoDay } from '@/lib/applicationRules';

export type RequirementState = 'fulfilled' | 'expires' | 'missing';

export interface RequirementCheck {
  requirement: Requirement;
  state: RequirementState;
  /** When a fulfilled requirement expires ('YYYY-MM-DD'), if it does. */
  expiresAt?: string;
}

/**
 * Requirements for a facility and the chosen areas, and whether the user meets
 * them. 'expires' = fulfilled today but expires before `endDate` (or within
 * the open-ended period, if no end date) — still allowed, but worth renewing.
 */
export function checkRequirements(userId: string, facilityId: string, areaIds: string[], endDate?: string, today: Date = new Date()): RequirementCheck[] {
  if (!facilityId) return [];
  const ids = new Set<string>(store.getFacilityRequirements(facilityId).map(fr => fr.requirement_id));
  for (const areaId of areaIds) store.getAreaRequirements(areaId).forEach(ar => ids.add(ar.requirement_id));
  const todayIso = isoDay(today);
  const held = store.getUserRequirements(userId);
  return store.getRequirements()
    .filter(r => ids.has(r.id))
    .map(requirement => {
      const ur = held.find(u => u.requirement_id === requirement.id && u.status === 'fulfilled');
      const expiresAt = ur?.expires_at ? String(ur.expires_at).slice(0, 10) : undefined;
      if (!ur || (expiresAt && expiresAt < todayIso)) return { requirement, state: 'missing' as const };
      if (expiresAt && (!endDate || expiresAt < endDate)) return { requirement, state: 'expires' as const, expiresAt };
      return { requirement, state: 'fulfilled' as const, expiresAt };
    })
    .sort((a, b) => a.requirement.name.localeCompare(b.requirement.name, 'sv'));
}
