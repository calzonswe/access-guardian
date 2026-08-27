-- Migration 0003: hierarchical areas (per facility) + organization units
-- 1) Areas can be nested inside another area of the SAME facility.
-- 2) Organization is modelled as units (VD/Avdelning/Enhet/Grupp) which
--    replaces the old organization_positions table. Users are assigned to a unit.

-- ---------- Areas hierarchy ----------
ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES areas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_areas_parent ON areas(parent_id);

-- ---------- Organization units ----------
CREATE TABLE IF NOT EXISTS organization_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'department', -- company | department | unit | group
  description TEXT,
  parent_id UUID REFERENCES organization_units(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_units_parent ON organization_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_units_manager ON organization_units(manager_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES organization_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_unit ON users(org_unit_id);

-- The old position tree is fully replaced by organization_units
DROP TABLE IF EXISTS organization_positions;
