-- Preserve historical outbox/operation receipts. The old outbox represented
-- blocked broadcasts, not provider delivery; it must never become dispatchable.
UPDATE mentoring.outbox SET status = 'cancelled' WHERE status IN ('pending', 'blocked');

CREATE TABLE mentoring.reminder_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations(id),
  participant_id uuid NOT NULL,
  recipient_staff_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('appointment', 'seven_day_overdue')),
  occurrence_key text NOT NULL CHECK (length(occurrence_key) BETWEEN 1 AND 1000),
  generation text NOT NULL CHECK (length(generation) BETWEEN 1 AND 4000),
  scheduled_at timestamptz NOT NULL,
  reference_at timestamptz NOT NULL,
  last_evaluated_by uuid NOT NULL,
  last_evaluated_operation_id uuid,
  state text NOT NULL CHECK (state IN ('pending','dispatching','provider_accepted','delivered','failed','uncertain','cancelled','blocked')),
  reason text CHECK (reason IN ('missing_sms_provider','missing_sms_credentials','sending_disabled','invalid_staff_phone','superseded','recipient_ineligible','provider_rejected','provider_outcome_unknown','lease_expired')),
  claim_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, participant_id, recipient_staff_id, occurrence_key),
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants(organization_id, id),
  FOREIGN KEY (organization_id, recipient_staff_id) REFERENCES mentoring.memberships(organization_id, id),
  FOREIGN KEY (organization_id, last_evaluated_by) REFERENCES mentoring.memberships(organization_id, id),
  CHECK ((claim_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (state <> 'dispatching' OR claim_token IS NOT NULL)
);
CREATE INDEX reminder_jobs_due_idx ON mentoring.reminder_jobs(organization_id, scheduled_at, id) WHERE state IN ('pending','blocked');
CREATE INDEX reminder_jobs_scope_idx ON mentoring.reminder_jobs(organization_id, participant_id, updated_at DESC);

CREATE TABLE mentoring.reminder_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations(id),
  job_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  claim_token uuid NOT NULL UNIQUE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  state text NOT NULL CHECK (state IN ('dispatching','provider_accepted','delivered','failed','uncertain')),
  claimed_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  provider text NOT NULL CHECK (provider ~ '^[a-zA-Z0-9_-]{1,60}$'),
  generation text NOT NULL CHECK (length(generation) BETWEEN 1 AND 4000),
  scheduled_at timestamptz NOT NULL,
  reference_at timestamptz NOT NULL,
  recipient_version integer NOT NULL CHECK (recipient_version > 0),
  claimed_by_staff_id uuid NOT NULL,
  provider_reference text CHECK (provider_reference IS NULL OR provider_reference ~ '^[a-zA-Z0-9_.:/-]{1,200}$'),
  reason text CHECK (reason IN ('provider_rejected','provider_outcome_unknown','lease_expired')),
  UNIQUE (organization_id, job_id, attempt_number),
  FOREIGN KEY (organization_id, job_id) REFERENCES mentoring.reminder_jobs(organization_id, id),
  FOREIGN KEY (organization_id, participant_id) REFERENCES mentoring.participants(organization_id, id),
  FOREIGN KEY (organization_id, claimed_by_staff_id) REFERENCES mentoring.memberships(organization_id, id),
  CHECK (lease_expires_at > claimed_at),
  CHECK ((state = 'dispatching') = (finished_at IS NULL))
);
CREATE INDEX reminder_attempts_job_idx ON mentoring.reminder_attempts(organization_id, job_id, attempt_number DESC);
