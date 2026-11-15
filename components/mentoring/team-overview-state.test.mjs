import assert from "node:assert/strict";
import test from "node:test";
import { organizationTotals, organizationTree } from "./team-overview-state.ts";

const staffMember = (id, role, overrides = {}) => ({ id, organizationId: "org", role, active: true, displayName: id, coordinatorId: null, ...overrides });
const mentee = (id, mentorId, overrides = {}) => ({
  participant: { id, organizationId: "org", displayName: id, lifecycle: "active", deletedAt: null },
  assignment: mentorId ? { mentorId, coordinatorId: null } : null,
  deletedAt: null,
  ...overrides,
});

const ceo = staffMember("ceo", "ceo");
const dana = staffMember("dana", "coordinator");
const yael = staffMember("yael", "coordinator");
const staff = [
  ceo, dana, yael,
  staffMember("mentor-a", "mentor", { coordinatorId: "dana" }),
  staffMember("mentor-b", "mentor", { coordinatorId: "dana" }),
  staffMember("mentor-c", "mentor", { coordinatorId: "yael" }),
  staffMember("mentor-loose", "mentor"),
  staffMember("mentor-gone", "mentor", { coordinatorId: "dana", active: false }),
  staffMember("foreign", "mentor", { organizationId: "other", coordinatorId: "dana" }),
];
const participants = [
  mentee("m1", "mentor-a"), mentee("m2", "mentor-a"), mentee("m3", "mentor-b"), mentee("m4", "mentor-c"),
  mentee("m5", "mentor-loose"), mentee("m6", null),
  mentee("closed", "mentor-a", { participant: { id: "closed", organizationId: "org", displayName: "closed", lifecycle: "closed", deletedAt: null } }),
  mentee("deleted", "mentor-a", { deletedAt: "2026-01-01T00:00:00.000Z" }),
];

test("the CEO tree lists every coordinator with their mentors and those mentors' mentees", () => {
  const tree = organizationTree(ceo, staff, participants);
  assert.deepEqual(tree.teams.map((team) => team.coordinator.id), ["dana", "yael"]);
  const dana = tree.teams[0];
  assert.deepEqual(dana.mentors.map((node) => node.mentor.id), ["mentor-a", "mentor-b"]);
  assert.deepEqual(dana.mentors[0].mentees.map((view) => view.participant.id), ["m1", "m2"]);
  assert.equal(dana.mentorCount, 2);
  assert.equal(dana.menteeCount, 3);
  assert.equal(tree.teams[1].menteeCount, 1);
  assert.deepEqual(tree.withoutCoordinator.mentors.map((node) => node.mentor.id), ["mentor-loose"]);
  assert.deepEqual(tree.unassignedMentees.map((view) => view.participant.id), ["m6"]);
  assert.equal(tree.closedMentees, 1, "closed cards are reported but kept out of the tree; deleted cards disappear");
});

test("totals add up across teams, loose mentors and unassigned mentees", () => {
  const totals = organizationTotals(organizationTree(ceo, staff, participants));
  assert.deepEqual(totals, { coordinators: 2, mentors: 4, mentees: 6, unassignedMentees: 1 });
});

test("a coordinator only sees her own team", () => {
  const tree = organizationTree(dana, staff, participants.filter((view) => ["m1", "m2", "m3", "m6"].includes(view.participant.id)));
  assert.deepEqual(tree.teams.map((team) => team.coordinator.id), ["dana"]);
  assert.equal(tree.withoutCoordinator, null);
  assert.deepEqual(tree.unassignedMentees.map((view) => view.participant.id), ["m6"]);
  assert.equal(tree.teams[0].menteeCount, 3);
});

test("a mentor gets an empty tree and inactive mentors with no mentees are hidden", () => {
  const empty = organizationTree(staffMember("mentor-a", "mentor"), staff, participants);
  assert.deepEqual(empty, { teams: [], withoutCoordinator: null, unassignedMentees: [], closedMentees: 0 });
  assert.ok(!organizationTree(ceo, staff, participants).teams[0].mentors.some((node) => node.mentor.id === "mentor-gone"));
});

test("a former mentor who still holds mentees stays visible but is not counted as an active mentor", () => {
  const tree = organizationTree(ceo, staff, [...participants, mentee("m7", "mentor-gone")]);
  const team = tree.teams[0];
  assert.ok(team.mentors.some((node) => node.mentor.id === "mentor-gone"));
  assert.equal(team.mentorCount, 2);
  assert.equal(team.inactiveMentorCount, 1);
  assert.equal(team.menteeCount, 4);
});
