-- Operational settings contain no provider credentials. Existing organizations
-- receive explicit provisional defaults; every subsequent change is versioned.
CREATE TABLE mentoring.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES mentoring.organizations (id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  offline_lease_hours integer NOT NULL DEFAULT 24 CHECK (offline_lease_hours BETWEEN 1 AND 24),
  reminder_audience text NOT NULL DEFAULT 'responsible_team' CHECK (reminder_audience IN ('responsible_team', 'all_staff')),
  appointment_reminder_minutes_before integer NOT NULL DEFAULT 0 CHECK (appointment_reminder_minutes_before BETWEEN 0 AND 1440),
  overdue_reminders_enabled boolean NOT NULL DEFAULT true,
  overdue_repeat_hours integer CHECK (overdue_repeat_hours BETWEEN 1 AND 168),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  FOREIGN KEY (organization_id, updated_by) REFERENCES mentoring.memberships (organization_id, id)
);
INSERT INTO mentoring.organization_settings (organization_id) SELECT id FROM mentoring.organizations;

CREATE TABLE mentoring.organization_settings_history (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  version integer NOT NULL CHECK (version > 0),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  PRIMARY KEY (organization_id, version),
  FOREIGN KEY (organization_id, updated_by) REFERENCES mentoring.memberships (organization_id, id)
);

CREATE TABLE mentoring.monthly_reviews (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month, 4) <> '0000'),
  scope_staff_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 20000),
  reviewed boolean NOT NULL DEFAULT false,
  ceo_protected boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, scope_staff_id) REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, updated_by) REFERENCES mentoring.memberships (organization_id, id)
);
-- Separate partial indexes also support PostgreSQL versions before NULLS NOT DISTINCT.
CREATE UNIQUE INDEX monthly_reviews_organization_month_unique
  ON mentoring.monthly_reviews (organization_id, month) WHERE scope_staff_id IS NULL;
CREATE UNIQUE INDEX monthly_reviews_team_month_unique
  ON mentoring.monthly_reviews (organization_id, month, scope_staff_id) WHERE scope_staff_id IS NOT NULL;

CREATE TABLE mentoring.monthly_review_history (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  review_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  summary text NOT NULL CHECK (length(summary) <= 20000),
  reviewed boolean NOT NULL,
  ceo_protected boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  PRIMARY KEY (organization_id, review_id, version),
  FOREIGN KEY (organization_id, review_id) REFERENCES mentoring.monthly_reviews (organization_id, id),
  FOREIGN KEY (organization_id, updated_by) REFERENCES mentoring.memberships (organization_id, id)
);
