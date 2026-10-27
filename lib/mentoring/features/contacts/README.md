# Contact lifecycle

These handlers run inside the shared authenticated command transaction. The
caller locks the current participant, checks current edit scope before dispatch
and at completion, and writes the idempotency receipt atomically. Feature code
does not commit, provision providers, or send messages.

Provisional correction policy:

- Mentors may correct their own reports within current scope. Coordinators and
  the CEO may correct scoped reports. Invalidation is management-only.
- Every correction requires current participant, contact and appointment tokens
  and a reason. Invalidated reports cannot be restored through correction.
- On an active card, a corrected latest completed contact that remains latest
  and changes its actual time needs an explicit replacement appointment. The same applies when
  a recent unsuccessful attempt becomes the first/latest completed contact.
- A historical correction never replaces a newer accepted appointment. If a
  correction changes the effective latest contact, keep the appointment and show
  `appointment_requires_review`. Invalidation of the latest completed contact
  also retains the appointment and shows that warning. Explicit rescheduling or
  a newly accepted completed contact resolves the warning.
- Paused and closed cards allow authorized historical correction. They reject
  a supplied replacement appointment time. A correction that would otherwise
  replace the next appointment keeps its selected time and flags review instead;
  it never creates a new appointment on an inactive card.
- Contact-resource CEO protection governs correction. Participant `appointment`
  protection governs schedule changes; `manualColor` protection governs the
  independent manual report. Existing whole-record protection remains intact.

Revision history keeps the original contact author and original receipt time;
the correction author/time/reason are separate. Current review projections stay
keyed by revision; immutable review events preserve later decision changes.
`prior_state` appointment history is a snapshot captured by the current editor,
not a claim about the original appointment setter.

`loadContactHistory` batches already-authorized participant IDs. Its results are
supplementary read DTOs and do not establish access permission.

Run policy/schema tests with:

```sh
rtk proxy node --experimental-strip-types --test tests/mentoring/contacts/*.test.mjs
```

The PostgreSQL suite is opt-in, requires all migrations and the existing
development database, and cleans only its own fixtures:

```sh
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --experimental-strip-types --test tests/mentoring/contacts/postgres.integration.test.mjs
```
