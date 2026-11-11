-- Confirmed by Daniel: a week after the last completed contact, then weekly
-- until the next completed report. 168 is the wire/storage compatibility value;
-- the planner uses Jerusalem calendar weeks, preserving local time across DST.
ALTER TABLE mentoring.organization_settings
  ALTER COLUMN overdue_reminders_enabled SET DEFAULT true,
  ALTER COLUMN overdue_repeat_hours SET DEFAULT 168;

UPDATE mentoring.organization_settings
SET overdue_reminders_enabled=true, overdue_repeat_hours=168,
    version=version+1, updated_at=clock_timestamp()
WHERE overdue_reminders_enabled<>true OR overdue_repeat_hours IS DISTINCT FROM 168;

-- Job reconciliation stays with the normal participant-locked evaluator.
-- Existing attempts and their known/uncertain external outcomes are unchanged.
