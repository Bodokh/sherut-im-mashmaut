-- Contact revisions and independent manual/scheduling history are append-only
-- through the application command pipeline. Reviews retain their revision key.
CREATE TABLE mentoring.contact_revisions (
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  contact_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('phone', 'in_person')),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'no_answer')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  notes text NOT NULL CHECK (length(notes) <= 20000),
  invalidated_at timestamptz,
  revised_by_staff_id uuid NOT NULL,
  revised_at timestamptz NOT NULL,
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000),
  change_kind text NOT NULL CHECK (change_kind IN ('initial', 'correction', 'invalidation')),
  operation_id uuid,
  PRIMARY KEY (organization_id, contact_id, revision),
  FOREIGN KEY (organization_id, contact_id) REFERENCES mentoring.contacts (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, revised_by_staff_id) REFERENCES mentoring.memberships (organization_id, id),
  CHECK (outcome <> 'no_answer' OR method = 'phone'),
  CHECK (change_kind = 'initial' OR reason IS NOT NULL)
);
CREATE INDEX contact_revisions_participant_idx ON mentoring.contact_revisions (organization_id, participant_id, revised_at DESC);

CREATE TABLE mentoring.review_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  contact_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  decision text NOT NULL CHECK (decision IN ('approved', 'returned_for_correction')),
  reviewed_by_staff_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL,
  operation_id uuid,
  FOREIGN KEY (organization_id, contact_id) REFERENCES mentoring.contacts (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, reviewed_by_staff_id) REFERENCES mentoring.memberships (organization_id, id),
  UNIQUE (organization_id, reviewed_by_staff_id, operation_id)
);
CREATE INDEX review_events_participant_idx ON mentoring.review_events (organization_id, participant_id, reviewed_at DESC);
INSERT INTO mentoring.review_events (id,organization_id,contact_id,participant_id,revision,decision,reviewed_by_staff_id,reviewed_at)
SELECT gen_random_uuid(),r.organization_id,r.contact_id,c.participant_id,r.revision,r.decision,r.reviewed_by_staff_id,r.reviewed_at
FROM mentoring.reviews r JOIN mentoring.contacts c ON c.organization_id = r.organization_id AND c.id = r.contact_id;

ALTER TABLE mentoring.appointments ADD COLUMN source_contact_id uuid;
ALTER TABLE mentoring.appointments ADD COLUMN requires_review boolean NOT NULL DEFAULT false;
ALTER TABLE mentoring.appointments ADD CONSTRAINT appointments_source_contact_fk
  FOREIGN KEY (organization_id, source_contact_id) REFERENCES mentoring.contacts (organization_id, id);

CREATE TABLE mentoring.appointment_history (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  appointment_version integer NOT NULL CHECK (appointment_version > 0),
  mentor_id uuid NOT NULL,
  source_contact_id uuid,
  requires_review boolean NOT NULL,
  changed_by_staff_id uuid NOT NULL,
  changed_at timestamptz NOT NULL,
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000),
  change_kind text NOT NULL CHECK (change_kind IN ('prior_state', 'contact_recorded', 'contact_correction', 'contact_invalidation', 'rescheduled')),
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, appointment_id) REFERENCES mentoring.appointments (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, mentor_id) REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, changed_by_staff_id) REFERENCES mentoring.memberships (organization_id, id),
  UNIQUE (organization_id, appointment_id, appointment_version)
);
CREATE INDEX appointment_history_participant_idx ON mentoring.appointment_history (organization_id, participant_id, changed_at DESC);

CREATE TABLE mentoring.manual_color_history (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  color text NOT NULL CHECK (color IN ('green', 'orange', 'red')),
  set_by_staff_id uuid NOT NULL,
  set_at timestamptz NOT NULL,
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000),
  participant_version integer NOT NULL CHECK (participant_version > 0),
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, set_by_staff_id) REFERENCES mentoring.memberships (organization_id, id),
  UNIQUE (organization_id, participant_id, participant_version)
);
CREATE INDEX manual_color_history_participant_idx ON mentoring.manual_color_history (organization_id, participant_id, set_at DESC);
