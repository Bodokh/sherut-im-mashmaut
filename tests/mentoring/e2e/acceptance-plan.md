# Whole-system browser acceptance

Run only after the root agent grants the exclusive browser/database fixture window and starts the reviewed production build on the local origin. Use the one approved development Clerk identity; database-only synthetic memberships may be created by the actual UI. Never create additional provider users, send invitations/SMS, change provider configuration, or deploy.

## Execution order

1. Capture the QA membership and organization settings exactly. Authenticate through the real Clerk UI. Confirm the anonymous offline HTML contains no authenticated DTO.
2. Create synthetic coordinator/mentors and partial participants through the UI. Verify assignment timing, editable staff information, initial assignment, and CEO-only replacement.
3. Record unanswered and completed contacts, missing-next-appointment validation, a second successful contact, revision-specific approval, correction, invalidation, rescheduling, manual color, and immutable history.
4. Exercise CEO grants, field/record protection and explicit unlock. Temporarily change only the approved QA membership's database role under the exclusive window; verify coordinator and mentor UI/read/write boundaries and metadata redaction, then restore the captured membership. These are real server-authorized role checks, not mocked browser auth.
5. Exercise pause/close/reactivation, delete/recycle/restore, monthly actual-contact versus received timing and narrative review/history, settings, and blocked reminder scans. Restore organization settings after the suite.
6. Persist a draft in every independently keyed form, close the native browser, reopen the same private profile offline, and assert the original values. Exercise administrative dependent queues, cold restart, automatic reconnect, and exactly-once accepted records.
7. Revoke the QA membership with pending work; verify locked/quarantined local work and current server denial. Restore the exact same membership and use the actual recovery controls; verify restored submissions require explicit review and are not silently replayed.
8. Capture final desktop/mobile screenshots and keyboard/overflow/contrast metrics. Close browser, clean only manifest IDs across all dependent tables, restore QA membership/settings, verify zero fixture remnants, and preserve the approved Clerk identity and CEO membership.

## Product acceptance mapping

| Criteria | Browser evidence |
| --- | --- |
| AC-01, AC-16, AC-19 | Partial create/correct; no assignment anchor before initial assignment; accepted assignment begins seven-day clock; failed call/reschedule leaves anchor unchanged. Exact boundary arithmetic is also covered by domain tests. |
| AC-02–AC-07 | No-answer, successful phone/next appointment, second contact, reschedule, manual color with independent overdue state, management approval after central tracking already updates. |
| AC-08, AC-09, AC-11, AC-12 | Actual mentor/coordinator membership windows; direct URL and snapshot scope; CEO protection, permitted unrelated edits, protected conflict preservation, revocation quarantine/recovery. |
| AC-10, AC-13, AC-20, AC-21 | Incomplete durable draft; real native cold restart offline; queued local contact visible while accepted server state is unchanged; automatic reconnect and idempotent acceptance. |
| AC-14, AC-15 | CEO self mute restored; ordinary staff cannot mute; reminder recipient IDs are staff only, participant phone never a destination. No delivery claim. |
| AC-17 | Monthly actual versus reported counts, delayed reports, narratives/review version history, no inferred wellbeing score. |
| AC-18 | Real blue shadcn dialogs/selects/tabs/sheets; RTL desktop/mobile, keyboard focus, validation, pending/error states, no horizontal overflow. Physical devices, additional engines, screen readers, and full conformance remain explicit external gates. |

## Technical acceptance mapping

| Criteria | Evidence boundary |
| --- | --- |
| TA-01 | Actual reconnect/lost-response replay with one contact, one continuing appointment, and one canonical logical reminder generation; backend retry test supplements UI. |
| TA-02 | Database transaction failure/rollback belongs to the real PostgreSQL integration suite; browser verifies no success before durable acceptance and recoverable local work. |
| TA-03 | Out-of-order queued contacts exercised where UI permits; appointment revision conflict remains visible and recoverable rather than silently overriding a newer appointment. |
| TA-04–TA-07 | CEO-protected conflict, current-authority reads/writes, unrelated-field protection persistence, revision A approval retained while B is unapproved. |
| TA-08 | Blocked canonical reminder planning/supersession and contact ordering can be inspected locally. Claim/provider handoff race belongs to integration tests; no real external dispatch in this suite. |
| TA-09 | Provider uncertainty behavior is covered by transport tests only. Real provider timeout/delivery is not established while SMS is unconfigured. |
| TA-10 | Same native private profile close/reopen offline, all form drafts, dependency queues, explicit storage/recovery failures where safely injectable. Disk exhaustion/full-device persistence is not implied by successful normal restart. |
| TA-11 | Real authenticated shadcn journeys and responsive/keyboard evidence. |
| TA-12, TA-13 | Delayed report monthly timing, contact correction/invalidation history, cadence/appointment warning, canonical reminder supersession. |
| TA-14, TA-15 | Controlled real membership/protection changes before reconnect; current server ordering and stable preserved-conflict replay. Transaction race interleavings are additionally covered by PostgreSQL tests. |

Reports must list tested, failed, and not-tested criteria separately. Earlier slice screenshots/test passes are not evidence for newly implemented workflows.
