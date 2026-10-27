export const mentor = { id: "mentor-1", organizationId: "org-1", role: "mentor", active: true, version: 1 };
export const coordinator = { id: "coordinator-1", organizationId: "org-1", role: "coordinator", active: true, version: 1 };
export const ceo = { id: "ceo-1", organizationId: "org-1", role: "ceo", active: true, version: 1 };
export const participant = { id: "participant-1", organizationId: "org-1", displayName: "Example participant", serviceType: "national", phone: null, lifecycle: "active", version: 1 };
export const assignment = { id: "assignment-1", organizationId: "org-1", participantId: participant.id, mentorId: mentor.id, coordinatorId: coordinator.id, assignedAt: "2026-10-01T07:00:00.000Z", version: 1 };
export const appointment = { id: "appointment-1", organizationId: "org-1", participantId: participant.id, mentorId: mentor.id, scheduledAt: "2026-10-25T08:00:00.000Z", version: 1 };
export const contact = (overrides = {}) => ({ id: "contact-1", organizationId: "org-1", participantId: participant.id, actorId: mentor.id, method: "phone", outcome: "completed", occurredAt: "2026-10-18T07:00:00.000Z", receivedAt: "2026-10-18T07:05:00.000Z", revision: 1, invalidatedAt: null, ...overrides });
export const reference = (overrides = {}) => ({ organizationId: "org-1", participantId: participant.id, assignedAt: assignment.assignedAt, contacts: [contact()], nextAppointment: appointment, ...overrides });
export const snapshot = (overrides = {}) => ({ participant, assignment, contacts: [contact()], nextAppointment: appointment, manualColor: "green", ...overrides });
