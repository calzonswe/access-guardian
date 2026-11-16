import { useMemo, useSyncExternalStore } from 'react';
import * as store from '@/services/dataStore';
import { canActOn } from '@/lib/applicationRules';
import type { Application, User } from '@/types/rbac';

/** Everyone below `managerId` in the reporting chain. */
export function subordinateIds(managerId: string, users: User[]): string[] {
  const out: string[] = [];
  const queue = [managerId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const u of users) {
      if (u.manager_id === id && !out.includes(u.id)) { out.push(u.id); queue.push(u.id); }
    }
  }
  return out;
}

/** Applications the user can approve or deny right now ("Att hantera"). */
export function actionableApplications(user: User | null): Application[] {
  if (!user) return [];
  const users = store.getUsers();
  const managedIds = user.roles.includes('line_manager') ? subordinateIds(user.id, users) : [];
  const substituteFor = user.substituting_for || [];
  return store.getApplications().filter(app => canActOn(app, user, {
    facility: store.getFacility(app.facility_id),
    applicant: store.getUser(app.applicant_id),
    managedIds,
    substituteFor,
  }));
}

/** Same as actionableApplications, re-computed whenever the data store changes. */
export function useActionableApplications(user: User | null): Application[] {
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => actionableApplications(user), [user, version]);
}
