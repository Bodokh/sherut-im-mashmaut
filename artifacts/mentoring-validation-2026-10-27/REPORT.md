# Mentoring phone input and validation — 27 October 2026

The mentoring forms use a shared shadcn phone input with Israel selected initially. New and changed phone values are validated and stored as E.164, for example `+972501234567`. The existing Micropay transport still removes the leading `+` for its outgoing recipient field. No live SMS was sent.

Validation now provides Hebrew field messages, accessible error associations and focus, and checks inputs before preparing a save. Failed local draft preparation preserves the current entries. Uncertain server responses retain the original operation identity for retry, including receipts accepted before phone normalization was introduced.

Additional fixes prevent monthly reviews from saving against a stale period when the visible month is invalid and show all service fields when reviewing a recovered participant draft.

## Verification

- `npm run check:mentoring`: 528 tests passed; whole-repository ESLint, route type generation and TypeScript passed.
- `npm run build`: passed against the final application source.
- 25 distinct mentoring browser scenarios passed using the local production build, the actual Clerk development identity and the approved development database.
- Four additional settings saves passed: minimum values, maximum values, an empty optional repeat interval, and restoration of the original policy.
- Source review found no remaining actionable blocker in the reviewed changes. The test fixture isolation issue found during review was resolved before the final borrower runs.

| Mentoring area | Browser coverage |
| --- | --- |
| Participant and staff profiles — 6 scenarios | Required/optional fields, whitespace, text limits, service and role choices, invalid phones, local/international E.164 persistence, explicit clearing, access cancellation and self-deactivation protection; participant and staff draft-storage failures followed by one accepted retry. |
| Assignment — 2 scenarios | Required mentor, eligible mentor/coordinator choices, exclusion of wrong roles, storage-failure retention of both durable baseline and unsaved selection, and exactly one accepted retry. |
| Contact reporting — 5 scenarios | Creation/correction/invalidation/rescheduling/color inputs; blank/future/nonexistent local dates, next-date ordering, text limits, method/outcome pairing, clear errors and focus. Storage failures during creation and correction preserve input and retry once. Successful invalidation/reschedule/color writes were not separately exercised in this focused lane. |
| Authority — 4 scenarios | Lifecycle/deletion reasons, protection selection, missing staff/permission choices, expired grants, mentor approval restrictions, and an actual owned participant delete/restore. |
| Settings/monthly/management — 3 scenarios | Eleven invalid numeric cases, whitespace and length limits, toggles/audience choices, 20,000-character review text, invalid-month rejection with preserved text and focus, and management page loading. |
| Offline and uncertain responses — 5 scenarios | Real accepted writes followed by simulated 501/429/unknown-400/network failures; retries use identical IDs/payloads with one receipt, audit and version increment. Prepared draft recovery survives failed cleanup and reload without a duplicate write. |

Rejected mentoring submissions were observed with scoped command interception and a 750 ms quiet window. Fault injection was scoped to each browser's owned draft and restored in `finally` blocks.

## Fixture and policy restoration

Each focused run completed ownership-checked cleanup. Staff setup was serialized because staff changes rebuild organization-wide reminders; concurrent borrower runs used a verified stable staff pool and guards against staff/settings changes. The pool was removed after borrower cleanup.

Independent final checks found zero participants, reminder jobs and unbound test staff. Original organization policy values were restored and verified through the normal versioned command. Its version advanced from 1 to 5; normal audit history remains intact. The QA account's SMS preference was not changed.

Two earlier assignment runner failures were caused by popup timing and an error-message selector, then resolved in the final 2/2 assignment run. Earlier contact and authority runner setup issues were similarly corrected and superseded by their passing final runs. The full-system run interrupted before resumption has no retained complete report and is not counted.

## Boundaries

This is local development validation. Production deployment, live SMS delivery, all browser engines, physical devices, full screen-reader acceptance, every role-specific journey and every possible input combination are not established. Blank participant creation is covered by the shared command-schema tests rather than an unmarked browser fixture. The recovered-profile summary was source/type checked but not separately exercised in a browser recovery journey.

The structured scenario results and cleanup evidence are in `browser-results.json`; automated quality output is in `local-check.log`, and production compilation output is in `build.log`. Private authentication state and fixture manifests are excluded from these artifacts.
