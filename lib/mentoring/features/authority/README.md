# Authority and participant lifecycle

Authority commands are CEO-only and share the command dispatcher's transaction,
current identity checks, version preconditions, audit, and idempotent receipt.
Grants and protection changes also carry their own expected revision. A grant
never delegates deletion or grants mentor approval. Provider identities and email
bindings are outside these commands.

The provisional inactive-record policy is explicit: `paused` and `closed` block
new contacts, assignment changes, and appointment rescheduling. Authorized staff
may still maintain profile information, manual color, historical contact
corrections, and reviews, subject to current scope and CEO protection. Historical
maintenance does not replace the existing appointment while inactive.

Lifecycle changes preserve the assignment anchor, accepted contact history, and
appointment. Pausing/closing cancels unsent reminders; reopening reconciles them
against the existing deadline. It does not fabricate contact or reset the clock.
These are provisional implementation defaults awaiting final product acceptance.

Deletion stores an attributed, reversible tombstone. Resource IDs, grants,
protection, history, and receipts remain. Ordinary staff cannot view or modify a
tombstone; the CEO can restore its prior lifecycle through the recycle bin.
No hard deletion or retention purge is implemented.

The real PostgreSQL suite requires all migrations and an explicitly reserved,
empty development participant baseline. It uses temporary fixtures and removes
only their organization-scoped rows, including canonical reminder jobs/attempts.
It never migrates or sends provider messages:

```sh
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --experimental-strip-types --test tests/mentoring/authority/postgres.integration.test.mjs
```
