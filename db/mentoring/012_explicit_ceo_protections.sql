-- Routine CEO edits no longer lock participant work. Reconcile only rows whose
-- automatic origin is supported by audit evidence; retain unclear legacy rows.
-- Deployment must stop application and scheduler writers before this migration:
-- locks drain existing transactions but cannot change code that resumes later.
-- Fail atomically if a worker still holds a conflicting lock; never wait forever.
SET LOCAL lock_timeout = '5s';
LOCK TABLE mentoring.memberships IN ACCESS EXCLUSIVE MODE;
LOCK TABLE mentoring.participants, mentoring.ceo_protections, mentoring.audit IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  protection record;
  explicit_event record;
  owner_id uuid;
  changed_participants uuid[] := ARRAY[]::uuid[];
  explicit_fields text[];
BEGIN
  FOR protection IN SELECT * FROM mentoring.ceo_protections WHERE reason IS NULL LOOP
    SELECT p.id INTO owner_id FROM mentoring.participants p
      WHERE p.organization_id = protection.organization_id AND p.id = protection.resource_id;
    IF owner_id IS NULL THEN
      SELECT c.participant_id INTO owner_id FROM mentoring.contacts c
        WHERE c.organization_id = protection.organization_id AND c.id = protection.resource_id;
    END IF;
    IF owner_id IS NULL THEN CONTINUE; END IF;

    -- Conflict audits omit successful state. Partially recorded explicit state
    -- makes the entire card ambiguous, so preserve its locks for manual review.
    IF EXISTS (
      SELECT 1 FROM mentoring.audit a
      WHERE a.organization_id = protection.organization_id AND a.participant_id = owner_id
        AND a.action = 'set_ceo_protection'
        AND (a.details ? 'resourceId' OR a.details ? 'active' OR a.details ? 'protectionVersion')
        AND NOT (
          jsonb_typeof(a.details->'resourceId') = 'string'
          AND a.details->>'resourceId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND jsonb_typeof(a.details->'active') = 'boolean'
          AND jsonb_typeof(a.details->'protectionVersion') = 'number'
          AND a.details->>'protectionVersion' ~ '^[1-9][0-9]{0,9}$'
          AND jsonb_typeof(a.details->'reason') = 'string'
          AND length(btrim(a.details->>'reason')) BETWEEN 1 AND 2000
          AND a.details ? 'fieldPaths'
          AND (a.details->'fieldPaths' = 'null'::jsonb OR jsonb_typeof(a.details->'fieldPaths') = 'array')
        ) IS TRUE
    ) THEN CONTINUE; END IF;

    SELECT a.* INTO explicit_event FROM mentoring.audit a
      WHERE a.organization_id = protection.organization_id AND a.participant_id = owner_id AND a.action = 'set_ceo_protection'
        AND a.details->>'resourceId' = protection.resource_id::text
        AND a.details ? 'active' AND a.details ? 'protectionVersion'
      ORDER BY (a.details->>'protectionVersion')::numeric DESC, a.created_at DESC, a.id DESC LIMIT 1;
    IF FOUND THEN
      explicit_fields := NULL;
      IF explicit_event.details->'fieldPaths' <> 'null'::jsonb THEN
        -- Never guess at a malformed or future field vocabulary.
        IF NOT (explicit_event.details->>'active')::boolean OR jsonb_array_length(explicit_event.details->'fieldPaths') = 0 THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(explicit_event.details->'fieldPaths') field
          WHERE jsonb_typeof(field) <> 'string' OR NOT ((field #>> '{}') = ANY(
            CASE WHEN protection.resource_id = owner_id THEN
              ARRAY['displayName','phone','serviceType','servicePlace','serviceRole','profileNotes','manualColor','appointment','assignment','lifecycle']
            ELSE ARRAY['method','outcome','occurredAt','notes','invalidatedAt'] END))) THEN CONTINUE; END IF;
        SELECT array_agg(value) INTO explicit_fields FROM jsonb_array_elements_text(explicit_event.details->'fieldPaths');
      END IF;
      UPDATE mentoring.ceo_protections SET
        active = (explicit_event.details->>'active')::boolean,
        field_paths = explicit_fields, reason = explicit_event.details->>'reason',
        protected_by_staff_id = explicit_event.actor_id,
        unlocked_by_staff_id = CASE WHEN (explicit_event.details->>'active')::boolean THEN NULL ELSE explicit_event.actor_id END,
        unlocked_at = CASE WHEN (explicit_event.details->>'active')::boolean THEN NULL ELSE explicit_event.created_at END,
        version = version + 1, updated_at = clock_timestamp()
      WHERE organization_id = protection.organization_id AND resource_id = protection.resource_id;
    ELSIF protection.active AND EXISTS (
      SELECT 1 FROM mentoring.audit a
      WHERE a.organization_id = protection.organization_id AND a.actor_id = protection.protected_by_staff_id
        AND a.participant_id = owner_id
        AND ((protection.resource_id = owner_id AND a.action IN
          ('create_participant','update_participant','assign_participant','record_contact','revise_contact','invalidate_contact','reschedule_appointment','set_manual_color','set_participant_lifecycle'))
          OR (a.details->>'contactId' = protection.resource_id::text AND a.action IN
          ('record_contact','review_contact','revise_contact','invalidate_contact')))
    ) THEN
      -- Preserve the row and advance its token: stale expected versions cannot
      -- reactivate a removed automatic lock.
      UPDATE mentoring.ceo_protections SET active = false, version = version + 1, updated_at = clock_timestamp()
        WHERE organization_id = protection.organization_id AND resource_id = protection.resource_id;
    ELSE CONTINUE;
    END IF;
    changed_participants := array_append(changed_participants, owner_id);
  END LOOP;
  UPDATE mentoring.participants SET version = version + 1, updated_at = clock_timestamp()
    WHERE id = ANY(changed_participants);
END $$;
