export type OrgUnitType = 'company' | 'department' | 'unit' | 'group';

export const ORG_UNIT_LABELS: Record<OrgUnitType, string> = {
  company: 'Företag / VD',
  department: 'Avdelning',
  unit: 'Enhet',
  group: 'Grupp',
};

/** Which parent types a unit type may be placed under. null = top level. */
export const ORG_ALLOWED_PARENTS: Record<OrgUnitType, (OrgUnitType | null)[]> = {
  company: [null],
  department: [null, 'company'],
  unit: ['department'],
  group: ['unit'],
};

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  description?: string;
  parentId?: string;
  managerId?: string;
  sortOrder?: number;
  children?: OrgUnit[];
}

export function flattenOrgUnits(units: OrgUnit[], depth = 0): { unit: OrgUnit; depth: number }[] {
  return units.flatMap(u => [{ unit: u, depth }, ...flattenOrgUnits(u.children || [], depth + 1)]);
}
