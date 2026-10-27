-- Applied once, atomically, by scripts/mentoring/migrate.mjs. Do not run a
-- destructive cleanup to make this migration pass: duplicate or unsafe legacy
-- grants require an explicit, attributed authority decision.

ALTER TABLE mentoring.grants
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN granted_by_staff_id uuid,
  ADD COLUMN revoked_by_staff_id uuid,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT grants_granted_by_staff_fk FOREIGN KEY (organization_id, granted_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  ADD CONSTRAINT grants_revoked_by_staff_fk FOREIGN KEY (organization_id, revoked_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  ADD CONSTRAINT grants_staff_participant_unique UNIQUE (organization_id, staff_id, participant_id),
  ADD CONSTRAINT grants_revocation_metadata CHECK ((revoked_by_staff_id IS NULL) = (revoked_at IS NULL)),
  ADD CONSTRAINT grants_active_revocation CHECK (NOT active OR revoked_at IS NULL);

-- The initial inline constraint is the only check on the actions column.
-- Replacement permits an empty, versioned revocation tombstone and forbids
-- delegating organizational deletion through a grant.
ALTER TABLE mentoring.grants DROP CONSTRAINT grants_actions_check;
ALTER TABLE mentoring.grants ADD CONSTRAINT grants_actions_check CHECK (
  actions <@ ARRAY['view', 'edit', 'approve']::text[] AND
  (NOT active OR cardinality(actions) > 0) AND
  (NOT (actions && ARRAY['edit', 'approve']::text[]) OR 'view' = ANY(actions))
);

-- Nullable attribution represents legacy unknown values; it must not be
-- backfilled with an invented actor. New commands supply the current CEO.
ALTER TABLE mentoring.ceo_protections
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN unlocked_by_staff_id uuid,
  ADD COLUMN unlocked_at timestamptz,
  ADD CONSTRAINT ceo_protections_unlocked_by_staff_fk FOREIGN KEY (organization_id, unlocked_by_staff_id)
    REFERENCES mentoring.memberships (organization_id, id),
  ADD CONSTRAINT ceo_protections_unlock_metadata CHECK ((unlocked_by_staff_id IS NULL) = (unlocked_at IS NULL)),
  ADD CONSTRAINT ceo_protections_active_unlock CHECK (NOT active OR unlocked_at IS NULL);

-- Deletion is reversible. The participant, resource namespace, assignment,
-- contact, appointment, grant, protection and audit rows remain in place.
ALTER TABLE mentoring.participants
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid,
  ADD COLUMN deletion_reason text,
  ADD COLUMN deleted_previous_lifecycle text,
  ADD CONSTRAINT participants_deleted_by_staff_fk FOREIGN KEY (organization_id, deleted_by)
    REFERENCES mentoring.memberships (organization_id, id),
  ADD CONSTRAINT participants_deletion_metadata CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL AND deleted_previous_lifecycle IS NULL)
    OR
    (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND deletion_reason IS NOT NULL
      AND length(btrim(deletion_reason)) BETWEEN 1 AND 2000
      AND deleted_previous_lifecycle IS NOT NULL
      AND deleted_previous_lifecycle IN ('active', 'paused', 'closed'))
  );

CREATE INDEX participants_organization_deleted_idx
  ON mentoring.participants (organization_id, deleted_at DESC, id)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX participants_organization_live_idx
  ON mentoring.participants (organization_id, created_at DESC, id)
  WHERE deleted_at IS NULL;
