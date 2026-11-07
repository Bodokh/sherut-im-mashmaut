CREATE TABLE mentoring.staff_onboarding_emails (
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  recipient_email text NOT NULL CHECK (recipient_email = lower(btrim(recipient_email)) AND length(recipient_email) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'accepted', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id text CHECK (provider_id IS NULL OR length(provider_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, staff_id),
  FOREIGN KEY (organization_id, staff_id) REFERENCES mentoring.memberships (organization_id, id) ON DELETE CASCADE,
  CHECK ((attempt_count = 0) = (first_attempt_at IS NULL)),
  CHECK ((status = 'accepted') = (provider_id IS NOT NULL))
);

CREATE INDEX staff_onboarding_emails_due_idx
  ON mentoring.staff_onboarding_emails (organization_id, next_attempt_at, staff_id)
  WHERE status = 'queued';

-- Pending invitations are tied to the original approval. A later reactivation
-- or restoration of the original email must not revive a cancelled invitation.
CREATE FUNCTION mentoring.cancel_stale_staff_onboarding_email() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mentoring.staff_onboarding_emails
  SET status = 'cancelled'
  WHERE organization_id = NEW.organization_id AND staff_id = NEW.id AND status = 'queued';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cancel_stale_staff_onboarding_email
AFTER UPDATE OF active, email, auth_user_id ON mentoring.memberships
FOR EACH ROW
WHEN ((OLD.active AND NOT NEW.active)
  OR OLD.email IS DISTINCT FROM NEW.email
  OR (OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL))
EXECUTE FUNCTION mentoring.cancel_stale_staff_onboarding_email();
