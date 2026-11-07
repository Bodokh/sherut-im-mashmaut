ALTER TABLE mentoring.staff_onboarding_emails
  ADD COLUMN delivery_id uuid,
  ADD COLUMN kind text NOT NULL DEFAULT 'invitation' CHECK (kind IN ('invitation', 'access')),
  ADD COLUMN requested_at timestamptz NOT NULL DEFAULT now();

UPDATE mentoring.staff_onboarding_emails SET requested_at = created_at;

-- A NULL delivery_id retains the original staff-ID key. Every manual resend
-- gets its own ID, which also fences results from a previous delivery.
CREATE OR REPLACE FUNCTION mentoring.cancel_stale_staff_onboarding_email() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mentoring.staff_onboarding_emails
  SET status = 'cancelled'
  WHERE organization_id = NEW.organization_id AND staff_id = NEW.id AND status = 'queued'
    AND (NOT NEW.active OR OLD.email IS DISTINCT FROM NEW.email
      OR (kind = 'invitation' AND NEW.auth_user_id IS NOT NULL)
      OR (kind = 'access' AND NEW.auth_user_id IS NULL));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER cancel_stale_staff_onboarding_email
AFTER UPDATE OF active, email, auth_user_id ON mentoring.memberships
FOR EACH ROW
WHEN ((OLD.active AND NOT NEW.active)
  OR OLD.email IS DISTINCT FROM NEW.email
  OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id)
EXECUTE FUNCTION mentoring.cancel_stale_staff_onboarding_email();
