import assert from "node:assert/strict";
import test from "node:test";
import { coordinatorGroups, personalParticipants, teamStaff } from "./personal-area-state.ts";

const coordinator = { id: "coordinator", organizationId: "org", role: "coordinator", active: true };
const mentor = { id: "mentor", organizationId: "org", role: "mentor", active: true, coordinatorId: coordinator.id };
const inactive = { ...mentor, id: "inactive", active: false };
const other = { ...mentor, id: "other", coordinatorId: "other-coordinator" };
const foreign = { ...mentor, id: "foreign", organizationId: "foreign-org" };
const staff = [coordinator, mentor, inactive, other, foreign];
function card(id, assignment, extra = {}) {
  return { participant: { id, organizationId: "org", lifecycle: "active", createdBy: "ceo", ...extra }, assignment };
}
const ownAssignment = { mentorId: mentor.id, coordinatorId: coordinator.id };
const cards = [
  card("own", ownAssignment),
  card("closed", ownAssignment, { lifecycle: "closed" }),
  card("inactive-mentor", { ...ownAssignment, mentorId: inactive.id }),
  card("unassigned", null, { createdBy: coordinator.id }),
  card("granted", { mentorId: other.id, coordinatorId: "other-coordinator" }),
  card("deleted", ownAssignment, { deletedAt: "2026-11-11T12:00:00Z" }),
  card("foreign", ownAssignment, { organizationId: "foreign-org" }),
];

test("mentor personal area keeps all own undeleted cards, including closed followups", () => {
  assert.deepEqual(personalParticipants(mentor, cards).map((view) => view.participant.id), ["own", "closed"]);
});

test("coordinator personal area includes their team's cards and their unassigned cards", () => {
  assert.deepEqual(personalParticipants(coordinator, cards).map((view) => view.participant.id), ["own", "closed", "inactive-mentor", "unassigned"]);
});

test("coordinator groups preserve inactive mentors with responsibility and do not pull in foreign or other teams", () => {
  const groups = coordinatorGroups(coordinator, staff, cards);
  assert.deepEqual(groups.map(({ mentor, participants }) => [mentor?.id ?? null, participants.map((view) => view.participant.id)]), [
    ["mentor", ["own", "closed"]], ["inactive", ["inactive-mentor"]], [null, ["unassigned"]],
  ]);
});

test("a card stays visible if its assigned mentor is missing from the staff snapshot", () => {
  const groups = coordinatorGroups(coordinator, staff, [...cards, card("missing-mentor", { mentorId: "missing", coordinatorId: coordinator.id })]);
  assert.deepEqual(groups.at(-1).participants.map((view) => view.participant.id), ["unassigned", "missing-mentor"]);
});

test("team directory presents self and own mentors including inactive staff", () => {
  assert.deepEqual(teamStaff(coordinator, staff).map((member) => member.id), ["coordinator", "mentor", "inactive"]);
  assert.deepEqual(teamStaff({ ...coordinator, role: "ceo" }, staff).map((member) => member.id), ["coordinator", "mentor", "inactive", "other"]);
});

test("CEO personal overview retains all authorized undeleted participants", () => {
  assert.deepEqual(personalParticipants({ ...coordinator, role: "ceo" }, cards).map((view) => view.participant.id), ["own", "closed", "inactive-mentor", "unassigned", "granted"]);
});
