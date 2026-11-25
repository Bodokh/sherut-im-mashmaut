-- Coordinator-to-coordinator mentee assignment transfer requests (בקשות העברת שיוך).
-- Additive only: two new tables, no existing table or row is rewritten.
-- Authorization boundaries are enforced by server command handlers and workspace queries.
CREATE TABLE mentoring.transfer_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  participant_id uuid NOT NULL,
  source_assignment_id uuid NOT NULL,
  requester_coordinator_id uuid NOT NULL,
  current_coordinator_id uuid NOT NULL,
  target_mentor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  request_note text CHECK (request_note IS NULL OR (length(btrim(request_note)) > 0 AND length(request_note) <= 2000)),
  response_note text CHECK (response_note IS NULL OR (length(btrim(response_note)) > 0 AND length(response_note) <= 2000)),
  responded_by_staff_id uuid,
  resulting_assignment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, participant_id)
    REFERENCES mentoring.participants (organization_id, id),
  FOREIGN KEY (organization_id, source_assignment_id)
    REFERENCES mentoring.assignments (organization_id, id),
  FOREIGN KEY (organization_id, resulting_assignment_id)
    REFERENCES mentoring.assignments (organization_id, id),
  FOREIGN KEY (organization_id, requester_coordinator_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, current_coordinator_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, target_mentor_id)
    REFERENCES mentoring.memberships (organization_id, id),
  FOREIGN KEY (organization_id, responded_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK (requester_coordinator_id <> current_coordinator_id),
  CHECK ((status = 'pending') = (responded_at IS NULL)),
  CHECK ((status = 'approved') = (resulting_assignment_id IS NOT NULL)),
  CHECK (status <> 'pending' OR (response_note IS NULL AND responded_by_staff_id IS NULL))
);

CREATE UNIQUE INDEX transfer_requests_one_pending_per_requester
  ON mentoring.transfer_requests (organization_id, participant_id, requester_coordinator_id)
  WHERE status = 'pending';

CREATE INDEX transfer_requests_incoming_idx
  ON mentoring.transfer_requests (organization_id, current_coordinator_id, status, created_at DESC);

CREATE INDEX transfer_requests_outgoing_idx
  ON mentoring.transfer_requests (organization_id, requester_coordinator_id, status, created_at DESC);

CREATE INDEX transfer_requests_participant_idx
  ON mentoring.transfer_requests (organization_id, participant_id, created_at DESC);

CREATE TABLE mentoring.transfer_request_emails (
  organization_id uuid NOT NULL,
  transfer_request_id uuid NOT NULL,
  recipient_staff_id uuid NOT NULL,
  recipient_email text NOT NULL CHECK (recipient_email = lower(btrim(recipient_email)) AND length(recipient_email) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'accepted', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id text CHECK (provider_id IS NULL OR length(provider_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, transfer_request_id),
  FOREIGN KEY (organization_id, transfer_request_id)
    REFERENCES mentoring.transfer_requests (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, recipient_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  CHECK ((attempt_count = 0) = (first_attempt_at IS NULL)),
  CHECK ((status = 'accepted') = (provider_id IS NOT NULL))
);

CREATE INDEX transfer_request_emails_due_idx
  ON mentoring.transfer_request_emails (organization_id, next_attempt_at, transfer_request_id)
  WHERE status = 'queued';
