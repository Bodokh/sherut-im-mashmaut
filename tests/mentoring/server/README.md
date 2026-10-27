Run validation tests without a database:

```sh
rtk proxy node --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/server/validation.test.mjs
```

After applying every `db/mentoring` migration through `006`, reserve an exclusive development database window with no existing participants, then run the real PostgreSQL suite explicitly:

```sh
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/server/*.test.mjs
```

The integration suite loads existing `.env.local` values when needed, uses random temporary staff and participant records, and deletes its own fixtures afterward. It refuses `NODE_ENV=production`, missing migrations, and a nonempty participant baseline before writing fixtures. Staff changes now rebuild reminders across the organization, so an empty serial window prevents fixture actors from replacing attribution on legitimate reminders. Other database suites, reminder scans, and browser fixture creation must wait until cleanup completes. The ordinary test invocation skips database access.

Final frozen-source verification on 2026-10-26: **30 passing test results, 0 failed, 0 skipped** against migrations `001`–`006`. Node counts 19 real database scenarios, 10 validation tests, and the containing integration test. The run took 235.7 seconds. Backend/contracts/domain/feature source and the core test fingerprint stayed unchanged before and after execution.

A separate read-only check confirmed all 21 participant/contact/assignment/protection/grant/operation/audit/history/reminder data tables were empty after fixture cleanup. Fixture staff count was zero, the one approved QA staff membership remained, and organization settings retained version 1.

These tests exercise database persistence, transactions, optimistic concurrency, current staff authorization, object protection, canonical reminder job identity and rollback, and offline snapshot leases bounded by known grant expiry. The lease test updates one versioned grant row because authority now retains a unique staff/participant pair. Initial matching remains available to coordinators; an existing assignment requires CEO replacement, including within the same team.

The initial-contact rollback case confirms a real contact insert, then makes the appointment write execute PostgreSQL error `22012`. It verifies an acknowledged rollback, no retry, no surviving contact/appointment/history/job/audit/resource/receipt effects, restored client/pool methods, and subsequent real pool reuse. No production hook, mock backend, or schema trigger is installed.

Receipt regressions retain explicit edit access while removing the former role: a demoted coordinator cannot replay a correction to another author's contact, and a former CEO cannot replay a replacement assignment. An original coordinator matching receipt remains replayable after reassignment without rewinding current state. Automatic CEO profile/assignment protection names the fields actually supplied or changed; fresh mentor contact remains possible while the CEO's values remain protected. An empty CEO create creates no whole-record protection. The two original contact-append assertions remain unchanged.

Cleanup removes reminder attempts/jobs and contact, review, appointment, color and fixture-team monthly histories before their parent rows. It deletes only fixture-owned participant/resource/staff records and refuses unexpected attribution on nonfixture reminders or shared settings. Legacy outbox rows remain historical; the tests verify new contacts create no legacy broadcasts. The containing test allows six minutes for the added transactional history and reminder work; targeted lock waits and retry bounds remain asserted.

The suite does not prove Clerk sign-in, browser offline storage, hosted scheduling, or SMS delivery. It never dispatches a provider transport or creates provider accounts.
