# Mentoring system specification and design

Version 0.4 · 27 October 2026 · Specification, development implementation and readiness

The mentoring system helps staff keep personal contact with each participant at least once every seven days. Each participant has one accountable mentor, with coordinator oversight and final CEO authority.

This folder contains the staff product specification, design references and development implementation evidence. The repository's existing [PRODUCT.md](../../PRODUCT.md) describes the public nonprofit website and remains its separate product brief.

The product and design documents retain the agreed/proposed requirement contract and their original review context. Use [readiness](readiness.md) and [development](development.md) for current implementation and test status.

| Document | Purpose |
| --- | --- |
| [Product specification](product-spec.md) | Confirmed requirements, proposed V1 boundaries, workflows, permissions, data model, and acceptance scenarios. |
| [UX design](ux-design.md) | Screen structure, Hebrew interface copy, desktop/mobile layouts, interactions, and exceptional states. |
| [shadcn component specification](component-spec.md) | Required functional component foundation, blue semantic theming, screen/component mapping, RTL, and real-component acceptance. |
| [Technical specification](technical-spec.md) | Data model, command/transaction contracts, access checks, offline synchronization, notification delivery, and integration requirements. |
| [Implementation plan](implementation-plan.md) | Sequenced work packages, dependencies, decision ownership, and acceptance evidence. |
| [Development guide](development.md) | Current `/staff` implementation, development integrations, setup/test commands and external blockers. |
| [Requirement and evidence ledger](readiness.md) | All AC-01–AC-21 and TA-01–TA-15 mapped to implementation/test source, current verification, credentials and policy/client acceptance gates. |
| [Staff acceptance walkthrough](acceptance-checklist.md) | Facilitated role/offline/error checks and blank client sign-off; records exceptions without claiming acceptance. |
| [Operations handoff](operations-handoff.md) | Account/incident ownership, configuration names, guarded migrations, restore/rollback preparation and production launch gates. |
| [Deployment record](deployment-preview.md) | Existing-account Preview checkpoints, current integrated candidate and separate production preparation/acceptance limits. |
| [Remaining client questions](client-questions.he.md) | Short Hebrew questions for unresolved client decisions. |
| [Micropay integration](micropay-integration.md) | Selected SMS provider, implementation/configuration and provider-verification boundaries; future WhatsApp is separate. |
| [Visual design system](design-system.md) | Styling principles and initial token exploration to inform the real shadcn implementation; exact wireframe styling is not approved production design. |
| [Interactive wireframe](wireframes.html) | Six connected flow examples using fictional data. It does not implement shadcn, staff accounts, central storage, offline synchronization, or messaging. |
| [Decision register](decision-register.md) | Source decisions, recommendations awaiting agreement, and remaining client questions in Hebrew. |
| [Self-review](self-review.md) | Candid product/design findings, independent review evidence, and the gap between a preview and production readiness. |

The project owner requires real shadcn/ui components customized with a blue color scheme for the developed product. Read the product and component specifications before treating a wireframe interaction or appearance as an implementation requirement. A visual recommendation is not automatically an agreed business rule.

**[Production staff](https://www.imashmaut.co.il/staff) first-time Google signup/login passed: Online, CEO, user-confirmed working.** Fix `b15cb77eca4cb9ea4e88a9942949d66b4fb48f5f` is pushed/production Ready; **450 tests** (244 client/206 server), lint/TypeScript passed. Verified primary email/preapproved membership checks remain. Production reload was triggered but not visually confirmed before the user stopped testing; unapproved-production-account testing was not performed. [Deployment record](deployment-preview.md) preserves earlier failures, Preview proof and exact limits. Neutral staff copy/feminine participant references/data/public marketing copy are preserved.

The recorded pre-preview local baseline uses development Clerk/Neon: build **`ZtyXUj8St-E_Hpz8dB7UQ`**, **400 tests**, lint/typecheck/HTTP, Chrome **12 groups**, Firefox **15** and updated-WebKit **15 functional groups**. These earlier browser results are not fresh full-suite acceptance of the updated Preview. [Readiness](readiness.md) preserves their source and diagnostic limits.

The unified quality command, two deterministic quota-write injections and populated scheduled-route/PostgreSQL check pass with delivery blocked. Final focused accessibility **6/1/1** passes eight page audits and nine controlled resize views; raw dialog guard findings/manual AT remain. No app fix, native-zoom/clipping or full WCAG acceptance is claimed.

Historical Chrome **39 broad-business groups** remain separate from the current 12 bounded groups. Current Chrome verifies strict 19-draft/native mentor/sync-once/dedup and measured styles with exact cleanup. The completed fixed-runtime WebKit matrix is **15 passed / 2 failed / 1 not tested**: native exact-draft/reconnect works, while automatic post-verification navigation was not observed within ten seconds and strict no-errors recorded **44 CORS-shaped diagnostics**. Legitimate Continue worked; no cause, unexpected failed RSC chain or concrete app bug was established. Vendor probe and actual Safari/iPhone remain untested.

Measured isolated Playwright 1.64.1/WebKit 27.2 r2370 native success follows the [upstream fix evidence](readiness.md), with no app/bundled/global dependency changes. Historical 28/2/1, focused 6/1/2 and current full 15/2/1 results stay separate; no fix, zero-diagnostics or all-device acceptance is claimed.

Recorded pre-neutral-copy synthetic captures: [dashboard](qa/completion-dashboard-desktop.png), [team](qa/completion-team-desktop.png), [mobile contact](qa/completion-contact-mobile.png), [oversight](qa/completion-oversight-desktop.png). Exact cleanup restored the original QA actor/settings at v6/v1, all 22 counters zero, and deleted private profiles. The images show controlled records before cleanup.

**Separate client-owned production accounts/control and final handoff remain required.** Distinct Clerk/Neon, six migrations, reviewed preapproval tooling/13 tests and three-owner apply/replay are verified. Domain/email/SSL and original15 DNS records pass. Read-only proof now shows three active CEO memberships/two bound/one unbound; first-admin Google login is browser-proven. These bindings and resource setup do not establish full client/operational acceptance.

Micropay production sending stays paused/brand-restricted; no automatic cron is configured. First-admin Google OAuth works, while strict every-login OTP remains a client decision/unproved gate. Provider delivery, branding, scheduling, policy/device/client acceptance and final client-owned handoff retain separate boundaries.

`GET /api/internal/mentoring/reminders` has recorded empty/populated direct-route/PostgreSQL proof with delivery blocked; hosted cron/provider acceptance remains separate. Ancillary scope remains open/proposed deferrals; current provider/client/testing gates are recorded in readiness.

Recorded core PostgreSQL 30/30/contact 16/16 predates later dispatcher/provider changes. Latest local suite is 442; the earlier native Chrome and blocked scheduler proofs remain their recorded checkpoints, not a fresh core/contact PG invocation.

Production's www proxy update was rejected by Clerk; the current correction uses verified live DNS and retains the development proxy. See the deployment record for final runtime proof. Vercel CLI65.4.0 was used through `npx`; no global tool update is claimed.

The current provisional [CEO protection contract](technical-spec.md#6-authorization-and-ceo-protection) protects the affected information while preserving routine new-contact work. Existing whole-record locks and explicit scheduling locks remain enforced; automatic actions cannot silently narrow them. The ledger records the real regression and final retest status.

## How to review

1. Walk through mentor home → participant → record a completed phone call → choose the next date/time.
2. Repeat with an unanswered call and check that it does not satisfy the weekly obligation.
3. Inspect the manually chosen color separately from the calculated follow-up deadline. Their separation is a recommendation awaiting agreement.
4. Review coordinator approval, CEO protection, and the offline conflict example.
5. Review the [readiness ledger](readiness.md) and provisional defaults in the [decision register](decision-register.md) before accepting the release.

The writing is in English for the project owner; interface examples are in Hebrew. Design artifacts and development evidence do not establish a production release or client acceptance.

## Suggested delivery sequence

| Stage | Reviewable output | Exit condition |
| --- | --- | --- |
| Product definition | This specification, decision register, and UX draft | CEO resolves scope decisions and agrees on the business rules. |
| Interaction and component design | Reviewed desktop/mobile flows plus real blue-themed shadcn screen composition and complete exceptional states | Mentor, coordinator, and CEO walkthroughs cover the agreed journeys; production visuals receive their own review. |
| Technical contract | Data/access model, full offline intent, correction/authority/oversight and reminder contracts | Implemented source is mapped to tests; provisional policy and provider dependencies remain explicit. |
| Implementation and acceptance | Full staff scope plus final integrated evidence against every AC/TA | Current checks pass, external integrations are verified, and agreed user acceptance/handover criteria are met. |

There is no agreed launch date, delivery duration, acceptance window, or support term yet. The specification does not invent these commitments.

## Draft verification

The initial version 0.1 received separate product/source reviews on 26 October 2026. Browser checks in headless Chrome exercised all six preview screens at widths of 1,440, 768, 390, and 375 CSS pixels, with no document-level horizontal overflow or JavaScript page errors. Desktop and mobile screenshots were visually inspected. That validated the flows, not the production visual quality; the self-review identifies the version 0.2 changes.

Interaction checks covered unsuccessful calls preserving the deadline, required next-appointment validation, manual color versus calculated due state, additional contact retaining one appointment, separate approval, no approval for a nonexistent report, mandatory SMS with CEO self-mute, and the conflict-review example. Refresh resets the fictional in-memory state.

These checks validate the design preview only. They do not establish production access control, authentication, real message delivery, persistent autosave, offline storage/synchronization, or accessibility certification.

Version 0.2 was separately source-reviewed and browser-checked after the visual revision. The same six-screen flow checks passed at 1,440, 768, 390, and 375 px. At 390×844, the first participant action starts at approximately 431 px. Checks across the six default views at desktop/mobile sizes found no normal rendered-text contrast failures or button/summary targets below 44×44 px. Local font loading, visible focus, mobile More/Escape behavior, reduced motion, and a next-appointment field reachable above the action bar at a 390×530 viewport were checked. Final desktop/mobile screenshots were visually inspected. The source detector reported zero findings; that is a static check, not a visual-quality or accessibility certification.
