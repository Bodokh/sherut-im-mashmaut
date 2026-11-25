import assert from "node:assert/strict";
import test from "node:test";
import {
  availableTransferTargets,
  buildTransferRequestCommand,
  buildTransferResponseCommand,
  incomingTransferRequests,
  outgoingTransferRequests,
  ownActiveMentors,
  pendingIncomingTransferCount,
} from "./transfer-state.ts";
import { parseCommand } from "../../lib/mentoring/validation.ts";

const coordinatorA = { id: "11111111-1111-4111-8111-111111111121", organizationId: "org", role: "coordinator", active: true, displayName: "רכזת א", coordinatorId: null };
const coordinatorB = { id: "11111111-1111-4111-8111-111111111122", organizationId: "org", role: "coordinator", active: true, displayName: "רכזת ב", coordinatorId: null };
const ceo = { id: "11111111-1111-4111-8111-111111111120", organizationId: "org", role: "ceo", active: true, displayName: "מנכ״לית", coordinatorId: null };
const mentorB1 = { id: "11111111-1111-4111-8111-111111111131", organizationId: "org", role: "mentor", active: true, displayName: "חונכת ב1", coordinatorId: coordinatorB.id };
const mentorBInactive = { id: "11111111-1111-4111-8111-111111111132", organizationId: "org", role: "mentor", active: false, displayName: "חונכת לא פעילה", coordinatorId: coordinatorB.id };
const mentorA1 = { id: "11111111-1111-4111-8111-111111111133", organizationId: "org", role: "mentor", active: true, displayName: "חונכת א1", coordinatorId: coordinatorA.id };

const dinaId = "11111111-1111-4111-8111-111111111141";
const tamarId = "11111111-1111-4111-8111-111111111142";
const protectedId = "11111111-1111-4111-8111-111111111143";

const requests = [
  {
    id: "11111111-1111-4111-8111-111111111151",
    organizationId: "org",
    participantId: dinaId,
    participantName: "דינה",
    sourceAssignmentId: "assign-1",
    requesterCoordinatorId: coordinatorB.id,
    currentCoordinatorId: coordinatorA.id,
    targetMentorId: mentorB1.id,
    status: "pending",
    requestNote: "מעוניינת להעביר לצוות שלי",
    responseNote: null,
    respondedByStaffId: null,
    resultingAssignmentId: null,
    createdAt: "2026-11-25T08:00:00.000Z",
    updatedAt: "2026-11-25T08:00:00.000Z",
    respondedAt: null,
    emailStatus: "queued",
  },
  {
    id: "11111111-1111-4111-8111-111111111152",
    organizationId: "org",
    participantId: tamarId,
    participantName: "תמר",
    sourceAssignmentId: "assign-2",
    requesterCoordinatorId: coordinatorA.id,
    currentCoordinatorId: coordinatorB.id,
    targetMentorId: mentorA1.id,
    status: "rejected",
    requestNote: null,
    responseNote: "ממשיכה בליווי הנוכחי",
    respondedByStaffId: coordinatorB.id,
    resultingAssignmentId: null,
    createdAt: "2026-11-24T08:00:00.000Z",
    updatedAt: "2026-11-24T09:00:00.000Z",
    respondedAt: "2026-11-24T09:00:00.000Z",
    emailStatus: "cancelled",
  },
];

const directory = [
  { participantId: tamarId, displayName: "תמר", serviceType: "national", currentCoordinatorId: coordinatorA.id, currentAssignmentId: "assign-tamar", assignmentProtected: false },
  { participantId: dinaId, displayName: "דינה", serviceType: "military", currentCoordinatorId: coordinatorA.id, currentAssignmentId: "assign-1", assignmentProtected: false },
  { participantId: protectedId, displayName: "נועה", serviceType: "national", currentCoordinatorId: coordinatorA.id, currentAssignmentId: "assign-noa", assignmentProtected: true },
];

const staff = [ceo, coordinatorA, coordinatorB, mentorA1, mentorB1, mentorBInactive];

test("incoming and outgoing transfer selectors scope requests by coordinator and expose full visibility to CEO", () => {
  assert.deepEqual(incomingTransferRequests(coordinatorA, requests).map((item) => item.participantId), [dinaId]);
  assert.deepEqual(outgoingTransferRequests(coordinatorA, requests).map((item) => item.participantId), [tamarId]);
  assert.equal(pendingIncomingTransferCount(coordinatorA, requests), 1);

  assert.deepEqual(incomingTransferRequests(coordinatorB, requests).map((item) => item.participantId), [tamarId]);
  assert.deepEqual(outgoingTransferRequests(coordinatorB, requests).map((item) => item.participantId), [dinaId]);
  assert.equal(pendingIncomingTransferCount(coordinatorB, requests), 0);

  assert.equal(incomingTransferRequests(ceo, requests).length, 2);
  assert.equal(pendingIncomingTransferCount(ceo, requests), 1);
});

test("ownActiveMentors and availableTransferTargets filter active team mentors and flag already-pending mentees", () => {
  assert.deepEqual(ownActiveMentors(coordinatorB, staff).map((member) => member.id), [mentorB1.id]);
  const targets = availableTransferTargets(coordinatorB, directory, requests);
  assert.equal(targets.find((item) => item.participantId === dinaId)?.hasPendingOutgoing, true);
  assert.equal(targets.find((item) => item.participantId === tamarId)?.hasPendingOutgoing, false);
  assert.deepEqual(availableTransferTargets(ceo, directory, requests), []);
});

test("transfer request and response command builders validate inputs, trim notes, and satisfy shared schema", () => {
  const opId = "0bb726ac-2921-4794-a8b1-9c52cb3f8437";
  const targets = availableTransferTargets(coordinatorB, directory, requests);
  const mentors = ownActiveMentors(coordinatorB, staff);

  // Already pending mentee is blocked
  assert.equal(buildTransferRequestCommand({ participantId: dinaId, targetMentorId: mentorB1.id, note: "" }, targets, mentors).ok, false);
  // CEO-protected mentee is blocked
  assert.equal(buildTransferRequestCommand({ participantId: protectedId, targetMentorId: mentorB1.id, note: "" }, targets, mentors).ok, false);
  // Mentor outside team is blocked
  assert.equal(buildTransferRequestCommand({ participantId: tamarId, targetMentorId: mentorA1.id, note: "" }, targets, mentors).ok, false);

  const requestResult = buildTransferRequestCommand({ participantId: tamarId, targetMentorId: mentorB1.id, note: "  בקשת העברה לתמר  " }, targets, mentors);
  assert.equal(requestResult.ok, true);
  const parsedReq = parseCommand({ ...requestResult.payload, operationId: opId });
  assert.equal(parsedReq.ok, true);
  assert.equal(parsedReq.command.note, "בקשת העברה לתמר");

  const blankNoteReq = buildTransferRequestCommand({ participantId: tamarId, targetMentorId: mentorB1.id, note: "   " }, targets, mentors);
  assert.equal(blankNoteReq.ok, true);
  assert.equal("note" in blankNoteReq.payload, false);
  assert.equal(parseCommand({ ...blankNoteReq.payload, operationId: opId }).ok, true);

  assert.equal(buildTransferRequestCommand({ participantId: tamarId, targetMentorId: mentorB1.id, note: "א".repeat(2001) }, targets, mentors).ok, false);

  const responseResult = buildTransferResponseCommand(requests[0].id, "approved", "  מאושרת בשמחה  ");
  assert.equal(responseResult.ok, true);
  const parsedRes = parseCommand({ ...responseResult.payload, operationId: opId });
  assert.equal(parsedRes.ok, true);
  assert.equal(parsedRes.command.decision, "approved");
  assert.equal(parsedRes.command.note, "מאושרת בשמחה");
});
