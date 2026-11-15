-- Management tracking cards (כרטיס מעקב) for mentees and for mentors.
-- Additive only: two new tables, no existing table or row is rewritten.
-- Only the CEO and coordinators may read or write these rows; that boundary is
-- enforced by the command handler and the workspace query, not by the browser.
CREATE TABLE mentoring.tracking_cards (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('mentee', 'mentor')),
  participant_id uuid,
  mentor_id uuid,
  status text CHECK (status IS NULL OR status IN ('green', 'orange', 'red')),
  status_at timestamptz,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  next_followup_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, mentor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, updated_by)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (
    (subject_kind = 'mentee' AND participant_id IS NOT NULL AND mentor_id IS NULL) OR
    (subject_kind = 'mentor' AND mentor_id IS NOT NULL AND participant_id IS NULL)
  ),
  CHECK ((status IS NULL) = (status_at IS NULL))
);

CREATE UNIQUE INDEX tracking_cards_one_per_mentee
  ON mentoring.tracking_cards (organization_id, participant_id) WHERE participant_id IS NOT NULL;
CREATE UNIQUE INDEX tracking_cards_one_per_mentor
  ON mentoring.tracking_cards (organization_id, mentor_id) WHERE mentor_id IS NOT NULL;

CREATE TABLE mentoring.tracking_reports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('mentee', 'mentor')),
  participant_id uuid,
  mentor_id uuid,
  author_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('phone', 'in_person', 'message')),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'no_answer')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL CHECK (length(btrim(notes)) > 0 AND length(notes) <= 20000),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, mentor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, author_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (
    (subject_kind = 'mentee' AND participant_id IS NOT NULL AND mentor_id IS NULL) OR
    (subject_kind = 'mentor' AND mentor_id IS NOT NULL AND participant_id IS NULL)
  )
);

CREATE INDEX tracking_reports_mentee_idx
  ON mentoring.tracking_reports (organization_id, participant_id, occurred_at DESC) WHERE participant_id IS NOT NULL;
CREATE INDEX tracking_reports_mentor_idx
  ON mentoring.tracking_reports (organization_id, mentor_id, occurred_at DESC) WHERE mentor_id IS NOT NULL;
