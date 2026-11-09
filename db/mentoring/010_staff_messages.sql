CREATE TABLE mentoring.staff_sms_batches (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations(id),
  sender_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  message text NOT NULL CHECK (length(btrim(message)) > 0 AND length(message) <= 1000),
  selected_recipients jsonb NOT NULL CHECK (jsonb_typeof(selected_recipients) = 'array' AND jsonb_array_length(selected_recipients) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, sender_staff_id, operation_id),
  FOREIGN KEY (organization_id, sender_staff_id) REFERENCES mentoring.memberships(organization_id,id),
  FOREIGN KEY (organization_id, sender_staff_id, operation_id) REFERENCES mentoring.operations(organization_id,actor_id,operation_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX staff_sms_batches_history_idx ON mentoring.staff_sms_batches(organization_id,created_at DESC,id);

CREATE TABLE mentoring.staff_sms_deliveries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations(id),
  batch_id uuid NOT NULL,
  destination text NOT NULL CHECK (destination ~ '^\+9725[0-9]{8}$'),
  recipient_staff_ids uuid[] NOT NULL CHECK (cardinality(recipient_staff_ids) BETWEEN 1 AND 500),
  recipient_names text[] NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','dispatching','provider_accepted','delivered','failed','uncertain','cancelled')),
  reason text CHECK (reason IN ('sender_ineligible','recipient_ineligible','provider_rejected','provider_outcome_unknown','lease_expired')),
  claim_token uuid UNIQUE,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  provider text CHECK (provider ~ '^[a-zA-Z0-9_-]{1,60}$'),
  provider_reference text CHECK (provider_reference IS NULL OR provider_reference ~ '^[a-zA-Z0-9_.:/-]{1,200}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,batch_id,destination),
  FOREIGN KEY (organization_id,batch_id) REFERENCES mentoring.staff_sms_batches(organization_id,id),
  CHECK (cardinality(recipient_staff_ids) = cardinality(recipient_names)),
  CHECK ((claim_token IS NULL) = (claimed_at IS NULL)),
  CHECK ((claim_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((claim_token IS NULL) = (provider IS NULL)),
  CHECK (lease_expires_at > claimed_at),
  CHECK (state <> 'dispatching' OR (claim_token IS NOT NULL AND finished_at IS NULL)),
  CHECK (state NOT IN ('provider_accepted','delivered','failed','uncertain') OR (claim_token IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE INDEX staff_sms_deliveries_pending_idx ON mentoring.staff_sms_deliveries(organization_id,created_at,id) WHERE state = 'pending';
CREATE INDEX staff_sms_deliveries_batch_idx ON mentoring.staff_sms_deliveries(organization_id,batch_id);
