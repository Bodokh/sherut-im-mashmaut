-- Remove the placeholder/demo record "פלוני אלמוני" (task 6) without risking
-- real data. Every branch is conditional and the whole script is idempotent: a
-- second run finds nothing left to change.
--
-- Mentee cards named exactly "פלוני אלמוני" (case/whitespace normalised):
--   * completely empty cards (no contact reports, no appointments, no reminder
--     attempts and no reminder currently in flight) are purged in the same FK
--     order as the in-app permanent delete;
--   * anything that carries history is only moved to the recycle bin (reversible
--     soft delete, attributed to an active CEO) so no report is destroyed.
-- Staff members with that name and no login (auth_user_id IS NULL) are only
-- deactivated, never deleted, and only when they have no active mentees.
DO $$
DECLARE
  placeholder_name constant text := 'פלוני אלמוני';
  card record;
  staff_row record;
  deleter uuid;
BEGIN
  FOR card IN
    SELECT p.organization_id, p.id, p.deleted_at
    FROM mentoring.participants AS p
    WHERE regexp_replace(btrim(p.display_name), '\s+', ' ', 'g') = placeholder_name
    ORDER BY p.created_at, p.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM mentoring.reminder_jobs AS j
      WHERE j.organization_id = card.organization_id AND j.participant_id = card.id
        AND j.state IN ('dispatching', 'uncertain')
    ) THEN
      RAISE NOTICE 'Placeholder participant % skipped: a reminder is in flight; remove it from the app later.', card.id;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM mentoring.contacts c WHERE c.organization_id = card.organization_id AND c.participant_id = card.id)
       AND NOT EXISTS (SELECT 1 FROM mentoring.appointments a WHERE a.organization_id = card.organization_id AND a.participant_id = card.id)
       AND NOT EXISTS (SELECT 1 FROM mentoring.reminder_attempts r WHERE r.organization_id = card.organization_id AND r.participant_id = card.id)
       AND NOT EXISTS (SELECT 1 FROM mentoring.tracking_reports t WHERE t.organization_id = card.organization_id AND t.participant_id = card.id)
    THEN
      DELETE FROM mentoring.tracking_cards WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.reminder_jobs WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.outbox WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.conflicts WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.audit WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.ceo_protections WHERE organization_id = card.organization_id AND resource_id = card.id;
      DELETE FROM mentoring.grants WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.assignments WHERE organization_id = card.organization_id AND participant_id = card.id;
      DELETE FROM mentoring.participants WHERE organization_id = card.organization_id AND id = card.id;
    ELSIF card.deleted_at IS NULL THEN
      SELECT m.id INTO deleter
      FROM mentoring.memberships AS m
      WHERE m.organization_id = card.organization_id AND m.role = 'ceo' AND m.active
      ORDER BY m.created_at, m.id
      LIMIT 1;
      IF deleter IS NULL THEN
        RAISE NOTICE 'Placeholder participant % skipped: no active CEO to attribute the deletion to.', card.id;
        CONTINUE;
      END IF;
      UPDATE mentoring.reminder_jobs
      SET state = 'cancelled', reason = 'recipient_ineligible', updated_at = clock_timestamp()
      WHERE organization_id = card.organization_id AND participant_id = card.id AND state IN ('pending', 'blocked');
      UPDATE mentoring.outbox SET status = 'cancelled'
      WHERE organization_id = card.organization_id AND participant_id = card.id AND status IN ('blocked', 'pending');
      UPDATE mentoring.participants
      SET deleted_at = clock_timestamp(), deleted_by = deleter,
          deletion_reason = 'הוסרה רשומת דוגמה (פלוני אלמוני)',
          deleted_previous_lifecycle = lifecycle,
          last_ceo_version = version + 1, version = version + 1, updated_at = clock_timestamp()
      WHERE organization_id = card.organization_id AND id = card.id;
    END IF;
  END LOOP;

  FOR staff_row IN
    SELECT m.organization_id, m.id
    FROM mentoring.memberships AS m
    WHERE regexp_replace(btrim(m.display_name), '\s+', ' ', 'g') = placeholder_name
      AND m.role <> 'ceo' AND m.auth_user_id IS NULL AND m.active
    ORDER BY m.created_at, m.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM mentoring.assignments a
      WHERE a.organization_id = staff_row.organization_id AND a.ended_at IS NULL
        AND (a.mentor_id = staff_row.id OR a.coordinator_id = staff_row.id)
    ) OR EXISTS (
      SELECT 1 FROM mentoring.memberships t
      WHERE t.organization_id = staff_row.organization_id AND t.coordinator_id = staff_row.id AND t.active
    ) THEN
      RAISE NOTICE 'Placeholder staff % skipped: still responsible for mentees or mentors.', staff_row.id;
      CONTINUE;
    END IF;
    UPDATE mentoring.memberships
    SET active = false, version = version + 1, updated_at = clock_timestamp()
    WHERE organization_id = staff_row.organization_id AND id = staff_row.id;
  END LOOP;
END
$$;
