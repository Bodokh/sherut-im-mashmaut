-- Coordinator authority (tasks 9/10) is scoped by assignments.coordinator_id.
-- Older assignments created before a mentor joined a team can carry a NULL
-- coordinator even though the mentor now belongs to a coordinator's team, which
-- would hide those mentees from the coordinator. Fill only NULL values on active
-- assignments from the mentor's current team. Rows that already name a
-- coordinator and mentors without a team are never touched, and the statement is
-- idempotent: a second run matches no rows.
UPDATE mentoring.assignments AS assignment
SET coordinator_id = mentor.coordinator_id
FROM mentoring.memberships AS mentor
WHERE assignment.organization_id = mentor.organization_id
  AND assignment.mentor_id = mentor.id
  AND assignment.ended_at IS NULL
  AND assignment.coordinator_id IS NULL
  AND mentor.role = 'mentor'
  AND mentor.coordinator_id IS NOT NULL;
