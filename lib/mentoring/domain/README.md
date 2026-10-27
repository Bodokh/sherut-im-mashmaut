# Mentoring domain rules

These pure TypeScript types and functions do not create authentication, storage, provider integrations, or a transaction. Server callers must evaluate current membership, scope, record revisions, and CEO protection **inside the accepting transaction or equivalent conditional commit**. Database idempotency receipts and authoritative conflict storage remain server responsibilities.

Exports are in `index.ts`; timestamps are explicit-offset ISO strings, normalized to UTC in calculated outputs. `computeFollowup` ignores unsuccessful, invalidated, future, other-participant, and other-organization contact entries when choosing the successful-contact anchor. Management approval and the mentor's manual color do not alter that calculation.

## Explicit provisional defaults

- Cadence: seven local calendar days at the same wall time in `Asia/Jerusalem`, not always 168 elapsed hours. On an overlapping clock time choose the earlier instant; on a nonexistent time shift forward by the gap. `DEFAULT_CADENCE_POLICY` names this policy. D-02 remains a client policy decision; this is not evidence that it was approved.
- A contact deadline becomes overdue at equality. A planned appointment is missed only after its scheduled instant.
- A next appointment after the seven-day deadline produces a warning; it does not move the cadence deadline. Blocking versus warning remains D-02.
- Coordinator scope defaults to assignments whose `coordinatorId` matches the current coordinator. Missing team metadata fails closed. Explicit current access grants can expand record scope. Deletion remains CEO-only and approval remains management-only.
- `computeFollowup.assignedAt` is the cadence anchor supplied by the agreed assignment policy. Reassignment must not silently select a new anchor until D-03 is decided.
- `applyRecordedContact` preserves a single current appointment. Stale successful uploads and appointment-version mismatch return a conflict containing the submitted intent; they do not overwrite newer scheduling. A repeated contact ID also returns a conflict for the server's idempotency/review process.
- Whole-record versus field-level CEO protection is configurable metadata. Omitted/empty protected field paths means whole-record protection; it is never an implicit unlock. Current protection remains in effect after unrelated revisions by other editors.

Participant lifecycle filtering, correction/invalidation policy, coordinator grant ceiling, and pending-work recovery after revocation remain application/product decisions. No clinical, emotional, or religious assessment is inferred from operational colors.

Run meaningful domain tests without installing a framework:

```sh
node --experimental-strip-types --test tests/mentoring/domain/*.test.mjs
```

The tests import erasable TypeScript directly and require a Node runtime that supports TypeScript stripping. The application is still checked through the repository's TypeScript/build commands.
