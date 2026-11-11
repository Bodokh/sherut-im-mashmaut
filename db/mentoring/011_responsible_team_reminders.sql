-- Confirmed reminder policy: the assigned mentor/coordinator receive notices
-- three days before the next contact and on its scheduled day.
ALTER TABLE mentoring.organization_settings
  ALTER COLUMN appointment_reminder_minutes_before SET DEFAULT 4320;

UPDATE mentoring.organization_settings
SET reminder_audience='responsible_team', appointment_reminder_minutes_before=4320,
    version=version+1, updated_at=clock_timestamp()
WHERE reminder_audience<>'responsible_team' OR appointment_reminder_minutes_before<>4320;

-- Jobs are rebuilt under each participant's normal lock on the next evaluation.
-- The dispatcher excludes obsolete recipients before candidate LIMIT and again
-- at claim, so no queued CEO/unrelated job may send during that transition.
-- Keep this settings migration independent of job locks and delivery evidence.
