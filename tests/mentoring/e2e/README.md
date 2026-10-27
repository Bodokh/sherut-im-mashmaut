# Local browser acceptance

`browser-check.mjs` checks public routes, staff access boundaries, anonymous shell caching, and responsive login controls against a running local server. It uses a fresh browser context, does not create credentials, and writes screenshots plus `report.json` outside the repository.

```sh
CHROME_EXECUTABLE=/path/to/chrome \
PLAYWRIGHT_MODULE_DIR=/path/to/node_modules \
node tests/mentoring/e2e/browser-check.mjs
```

If Playwright is installed in the project, `PLAYWRIGHT_MODULE_DIR` is unnecessary. The default URL is `http://localhost:3000`; override it with `MENTORING_BASE_URL` for another local port. The runner rejects remote hosts. Set `MENTORING_E2E_ARTIFACTS` to choose an output directory.

Signed-in and offline data journeys require a real development identity with explicitly preapproved staff membership. Passing the anonymous suite does not establish those journeys, SMS delivery, or production acceptance.

`signed-in-check.mjs` additionally exercises the explicitly approved development test identity, real staff preapproval/revocation, participant assignment, contact/appointment saving, review, SMS preferences, and a cold offline browser restart/reconnect. It requires `MENTORING_QA_WRITES=approved` and `MENTORING_QA_CREDENTIALS_FILE` pointing to an existing mode-600 credential file. It never creates Clerk users or sends invitations. It is restricted to the named development Neon project and Clerk test keys, and rejects production environment settings.

The signed-in runner creates synthetic database records with a unique run marker, verifies their ownership, and removes only its recorded IDs afterward. It preserves the approved test identity and CEO membership. Its fresh temporary browser profile is deleted after the run; reports contain no password, cookies, tokens, or stored browser authentication state. Do not copy credential files into the repository or enable network tracing around authentication.

`reconnect-check.mjs` is a focused cold-restart/reconnect check against a previously created synthetic participant. It additionally requires `MENTORING_QA_FIXTURE_MANIFEST`, retains its private browser profile for final visual checks, and appends new contact/operation IDs to that manifest. It does not repeat staff setup or delete the retained fixture.

When that review is complete, `cleanup-fixtures.mjs <manifest-path>` removes the recorded development fixture IDs only after locking and validating their exact synthetic names, creator, and relationships. It requires the same explicit `MENTORING_QA_WRITES=approved` and development-project guard. It never deletes the approved Clerk identity or CEO membership. Remove retained private browser-profile directories separately after inspection.

`whole-system-check.mjs` extends acceptance to the later contact revision, authority, lifecycle, oversight, reminder, management queue, and recovery features. Its scenario modules and [acceptance matrix](./acceptance-plan.md) identify the product/technical criteria and external evidence boundaries. Run this suite only after the root agent grants the exclusive browser/database window: it additionally requires `MENTORING_QA_WINDOW=exclusive` because it temporarily changes the one approved QA membership's real database role, then restores it. This never substitutes mock authentication or creates another provider account.

The broad suite records a private recovery manifest before fixture writes and uses `whole-system-cleanup.mjs` to validate exact ownership, remove all migration 001–006 fixture dependencies, and restore the captured QA membership and organization settings. Settings policy changes are exercised only with an empty nonfixture participant baseline. Native browser profiles are removed afterward; reports retain screenshots and safe assertion metadata. The approved existing credential file must include its private `developmentVerificationCode`; no authentication payload, password, session, cookie, or token is written to reports.

`MENTORING_QA_MODE=mentor-native` selects the bounded final-build supplement and defaults to a separate private `mentor-native` artifact folder. It creates long-name/email fixtures through the real UI, repeats all 19 form-draft variants with the browser offline from persistent-context construction, and exercises a real assigned mentor's offline completed contact and automatic reconnect. The single approved identity temporarily takes the mentor role and coordinator relationship. A guarded, reversible SQL fixture remap makes that identity the routine participant's assigned mentor; the report labels this setup explicitly. The assignment and current appointment mentor IDs, QA metadata, grants, and all created data are restored or removed afterward. This setup is not evidence that the QA assignment was created through the UI; ordinary UI assignment is covered separately.

The supplement then runs `whole-system-style.mjs` against the populated CEO session with mentoring mutations blocked. It checks actual card/footer geometry, header alignment, long staff rows and icon controls, form contrast under both OS color preferences, mobile overflow, and four current screenshots. Browser-engine compatibility has its own read-only runner and does not substitute for the populated Chromium workflows.
