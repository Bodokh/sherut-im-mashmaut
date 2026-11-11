# Local verification on 11 November 2026

The staff fixes were checked locally. No production deployment, production migration, real SMS delivery, or authenticated staff browser acceptance is established by these checks.

## Passed

- The final durable-reminder PostgreSQL suite passed **21/21** against an isolated disposable PostgreSQL 17 database. This exercises actual candidate and claim SQL, excludes CEO and unrelated recipients under legacy `all_staff` settings and view grants, and proves weekly/DST timing, no catch-up bursts, report-driven reset, and no duplicate external effect after notes-only report revisions across dispatching, accepted, delivered, uncertain, and failed states.
- Together with the backend lane's core **22**, contact **17**, permanent-deletion authority **12**, and migration-012 **1** checks, the coordinated PostgreSQL proof totals **73 passed**. Suites ran serially in the disposable database; reruns are not counted again. The core suite includes the coordinator's create → own-team assignment → profile edit → completed report path. The authority suite proves full related/history deletion, preserved unrelated cards, receipt replay, current CEO scope, and dispatch/uncertain barriers using the real lease-expiry function.
- Focused client storage/controller/online-SMS/online-purge/dialog checks passed **85/85**. These cover exact-name/reason confirmation, current record version, no offline deletion queue, immutable lost-response retry, current-device and remote-tombstone cleanup including recovery vaults/creation envelopes, unrelated work preservation, identity/navigation races, and locking residual data if local cleanup fails. They are component/controller proof with synthetic data, not an authenticated browser session.
- Migration **013** applied successfully; fixed settings were verified as `responsible_team`, 4,320 minutes before appointment, overdue reminders enabled, and 168-hour repeat.
- The changed public staff entrance passed **14/14** browser checks: Hebrew and English homepages at 375, 420, 640, 768, 1280, and 1440 pixels; visible and unobscured staff entrance; no document overflow or overlapping header groups; mobile menu entrance; and each language's actual homepage entrance reaching `/staff/login`.
- Selected Hebrew mobile, Hebrew desktop, English 1280-pixel, and desktop/mobile login screenshots were inspected. Header controls fit at the narrow and crowded breakpoints.
- The broader anonymous browser baseline passed **7** functional groups: public routes, canonical redirect, unauthorized staff redirects, private API rejection, anonymous offline-shell boundaries, login/password-recovery keyboard controls without credentials, and mobile fit.
- The **final optimized production build passed with exit 0** on the reviewed candidate after the confirmed purge and weekly-reminder changes: Next.js 16.4.3 compiled successfully in 4.7 seconds, TypeScript completed in 4.8 seconds, and **55/55** pages generated. It used in-process verified development auth configuration, disposable local database overrides, and SMS sending explicitly disabled.
- The root lane's final unified check passed **643 tests** (328 client, 315 server), whole-repository ESLint, Next route type generation, and TypeScript. This is separate from the focused PostgreSQL and browser evidence above.
- Updated `management-policy-check.mjs` and `whole-system-offline.mjs` now assert the fixed responsible-team reminder audience and accepted persisted policy instead of selecting `all_staff`. Syntax and focused ESLint checks passed.

## Limits and diagnostics

- The anonymous baseline's strict console group failed. It recorded `Initialization error: undefined - Cannot read properties of null (reading 'invalidAccountId')` and, on the final run, a React hydration diagnostic showing an unexpected `style={{caret-color:"transparent"}}` on the disabled password input. The latter appeared around mobile login screenshot capture; Playwright hides carets for screenshots, so an early screenshot is a possible cause, but that attribution was not proved. These diagnostics were not suppressed or counted as passing.
- The targeted changed-path browser run recorded no uncaught page errors. It is separate from the broader strict-console result.
- The signed-in browser journey and the two updated authenticated policy runners were **not run**: the existing QA credential/storage-state files were not present in the scoped known paths. No provider account or password was created or reset.
- Initial dev runs bound to `127.0.0.1` or `::` produced local Next proxy/canonical-origin artifacts. Restarting with the matching `localhost` bind and origin resolved login loading and restored the expected same-origin anonymous command **401** / external-origin **403** responses. No application change was made for this runtime setup issue.
- The first expanded reminder-PG run exposed interference from a deliberately unfinished fake dispatch claim left by the new regression fixture. Its later organization-wide expiry count was two instead of one. The fixture now settles that unsent fake claim after its evidence assertions. The complete final suite then passed **21/21**; no diagnostics were suppressed and this did not require another production-code change.

## Evidence and cleanup

Safe local reports and screenshots are in `/tmp/sherut-daniel-qa-20261111/`:

- `public-entry-final/report.json` and twelve screenshots: the passing changed-path run.
- `anonymous-final/report.json`: 7 passed, 1 failed strict-console group, 1 signed-in journey not tested.
- `final-build.log`: final successful optimized production build, exit 0. `build.log` retains the earlier initial-stage build separately.

Portable copies of the [changed-path report](public-entry-report.json), [anonymous baseline report](anonymous-baseline-report.json), and selected screenshots are retained here: [Hebrew 375](he-375.png), [Hebrew 1280](he-1280.png), [English 375](en-375.png), [English 1280](en-1280.png), [desktop login](staff-login-desktop.png), and [mobile login](staff-login-mobile.png). The reports retain their original local capture paths as provenance.

The recreated disposable database held zero participants, contacts, reminder jobs, and reminder attempts after the follow-up integrations and final build, with thirteen migrations applied. The named temporary PostgreSQL container was then stopped and removed. No local dev server remains running. The shared development Neon database and production systems were not mutated by this QA lane.
