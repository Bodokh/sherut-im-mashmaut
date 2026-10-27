CREATE SCHEMA IF NOT EXISTS mentoring;

CREATE TABLE mentoring.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO mentoring.organizations (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'שירות עם משמעות');

CREATE TABLE mentoring.memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  auth_user_id text UNIQUE CHECK (auth_user_id IS NULL OR length(auth_user_id) BETWEEN 1 AND 200),
  email text CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 320)),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  phone text CHECK (phone IS NULL OR length(phone) <= 40),
  role text NOT NULL CHECK (role IN ('mentor', 'coordinator', 'ceo')),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  coordinator_id uuid,
  sms_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, coordinator_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (coordinator_id IS NULL OR coordinator_id <> id),
  CHECK (role = 'ceo' OR NOT sms_muted)
);

CREATE UNIQUE INDEX memberships_organization_email_unique
  ON mentoring.memberships (organization_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX memberships_organization_active_idx
  ON mentoring.memberships (organization_id, active);

CREATE TABLE mentoring.participants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  display_name text NOT NULL DEFAULT 'חניכה ללא שם'
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  phone text CHECK (phone IS NULL OR length(phone) <= 40),
  service_type text CHECK (service_type IS NULL OR service_type IN ('national', 'military')),
  service_place text CHECK (service_place IS NULL OR length(service_place) <= 300),
  service_role text CHECK (service_role IS NULL OR length(service_role) <= 300),
  profile_notes text CHECK (profile_notes IS NULL OR length(profile_notes) <= 20000),
  lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'paused', 'closed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_ceo_version integer NOT NULL DEFAULT 0 CHECK (last_ceo_version >= 0 AND last_ceo_version <= version),
  manual_color text CHECK (manual_color IS NULL OR manual_color IN ('green', 'orange', 'red')),
  manual_color_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK ((manual_color IS NULL) = (manual_color_at IS NULL))
);

CREATE INDEX participants_organization_idx
  ON mentoring.participants (organization_id, created_at DESC);

CREATE TABLE mentoring.assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  coordinator_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  followup_anchor_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, mentor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, coordinator_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

CREATE UNIQUE INDEX assignments_one_active_participant
  ON mentoring.assignments (organization_id, participant_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_active_mentor_idx
  ON mentoring.assignments (organization_id, mentor_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_active_coordinator_idx
  ON mentoring.assignments (organization_id, coordinator_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_participant_history_idx
  ON mentoring.assignments (organization_id, participant_id, assigned_at DESC);

CREATE TABLE mentoring.contacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('phone', 'in_person')),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'no_answer')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  invalidated_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (outcome <> 'no_answer' OR method = 'phone')
);

CREATE INDEX contacts_participant_occurred_idx
  ON mentoring.contacts (organization_id, participant_id, occurred_at DESC);

CREATE TABLE mentoring.appointments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, mentor_id)
    REFERENCES mentoring.memberships (organization_id, id)
);

CREATE UNIQUE INDEX appointments_one_current_participant
  ON mentoring.appointments (organization_id, participant_id) WHERE is_current;
CREATE INDEX appointments_current_schedule_idx
  ON mentoring.appointments (organization_id, scheduled_at) WHERE is_current;

CREATE TABLE mentoring.reviews (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  contact_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  decision text NOT NULL CHECK (decision IN ('approved', 'returned_for_correction')),
  reviewed_by_staff_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, contact_id, revision),
  FOREIGN KEY (organization_id, contact_id)
    REFERENCES mentoring.contacts (organization_id, id),
  FOREIGN KEY (organization_id, reviewed_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id)
);

CREATE TABLE mentoring.grants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  staff_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  actions text[] NOT NULL CHECK (
    cardinality(actions) > 0 AND
    actions <@ ARRAY['view', 'edit', 'approve', 'delete']::text[]
  ),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id)
);

CREATE INDEX grants_active_staff_idx
  ON mentoring.grants (organization_id, staff_id, participant_id) WHERE active;

-- A protection can refer to either a participant profile or a contact object.
-- Resource existence/type is checked within the transaction applying the write.
CREATE TABLE mentoring.ceo_protections (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  resource_id uuid NOT NULL,
  protected_by_staff_id uuid NOT NULL,
  protected_revision integer NOT NULL CHECK (protected_revision > 0),
  active boolean NOT NULL DEFAULT true,
  field_paths text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, resource_id),
  FOREIGN KEY (organization_id, protected_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id)
);

CREATE TABLE mentoring.operations (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, actor_id, operation_id),
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES mentoring.memberships (organization_id, id)
);

CREATE TABLE mentoring.conflicts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  authoritative_value jsonb NOT NULL,
  submitted_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, actor_id, operation_id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, resolved_by)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, actor_id, operation_id)
    REFERENCES mentoring.operations (organization_id, actor_id, operation_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);

CREATE INDEX conflicts_unresolved_organization_idx
  ON mentoring.conflicts (organization_id, created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE mentoring.audit (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  participant_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, actor_id, operation_id)
    REFERENCES mentoring.operations (organization_id, actor_id, operation_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX audit_organization_created_idx
  ON mentoring.audit (organization_id, created_at DESC);
CREATE INDEX audit_participant_created_idx
  ON mentoring.audit (organization_id, participant_id, created_at DESC);

CREATE TABLE mentoring.outbox (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  recipient_staff_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'in_app')),
  scheduled_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'blocked'
    CHECK (status IN ('blocked', 'pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, actor_id, operation_id, recipient_staff_id, channel),
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, recipient_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, actor_id, operation_id)
    REFERENCES mentoring.operations (organization_id, actor_id, operation_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX outbox_dispatch_idx
  ON mentoring.outbox (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX outbox_participant_idx
  ON mentoring.outbox (organization_id, participant_id, created_at DESC);
