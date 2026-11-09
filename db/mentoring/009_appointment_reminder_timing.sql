ALTER TABLE mentoring.organization_settings
  DROP CONSTRAINT organization_settings_appointment_reminder_minutes_before_check,
  ADD CONSTRAINT organization_settings_appointment_reminder_minutes_before_check
    CHECK (appointment_reminder_minutes_before BETWEEN 0 AND 4320);

-- Keep early-send job IDs, terminal states and attempt evidence under the advance identity.
UPDATE mentoring.reminder_jobs
SET occurrence_key = left(occurrence_key, length(occurrence_key) - 1) || ',"advance"]'
WHERE kind = 'appointment' AND scheduled_at < reference_at
  AND occurrence_key ~ '^\["appointment","[[:alnum:]-]+",[0-9]+\]$';
