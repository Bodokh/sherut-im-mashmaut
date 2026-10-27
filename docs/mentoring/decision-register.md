# Mentoring system decision register

Version 0.4 · 27 October 2026 · Product owner: CEO

This register preserves the distinction between client decisions, proposed implementation behavior, and unanswered scope. Its authority is the client's latest answers in this conversation. Historical notes supply context only. English is used for project discussion; questions addressed to the client are written in Hebrew.

## Project-owner implementation decisions

| ID | Decision | Status |
| --- | --- | --- |
| U-01 | Build the actual staff UI from functional shadcn/ui components, customized with a coherent blue theme. Keep the HTML as a flow wireframe and develop the final visual treatment on the real component foundation. | Explicit project-owner requirement; implemented using Base UI based shadcn components. Acceptance evidence is recorded in [readiness](readiness.md). |
| U-02 | Continue implementation in parallel through the whole specified staff system. Defer work that needs unavailable credentials and identify its dependencies explicitly. | Latest project-owner direction. The first contact slice is no longer the implementation stopping point. A deferred provider integration is still required delivery work. |
| U-03 | Final production Vercel, Clerk and Neon accounts must be separate from development and client/organization-owned, including billing and administrator control. | Future handoff requirement retained. Later authorized preparation created distinct Production Clerk/Neon resources; original Development/Preview resources are retained. Client account ownership/handoff and real production login are not accepted by provisioning alone; see U-06/deployment record. |
| U-04 | Apply C-12 to all authorized application reads and edits, including administration. Persist offline administrative intent and validate it centrally on reconnect. | The earlier online-only administration proposal in technical §6 is superseded. First-time sign-in/OTP, provider account onboarding, and central enforcement on other devices require connectivity. Pending actions cannot expand readable authority. |
| U-05 | Equal-height row cards/flush footers; 44 px team-edit tooltip; centered Online/Offline/divider; white light-theme/pale disabled fills without OS-dark leakage; retained border/focus. | Current Chrome measured proof passes on Zty, including 20 px divider and edit dialog. Bounded browser evidence, not client/accessibility approval. Maps to AC-18/TA-11. |
| U-06 | Use current `main` and the existing linked Vercel project, no preview branch; preserve public website content. User authorized commit/push, owned by root. | `b15cb77` pushed/production Ready;450 tests/lint/TypeScript pass. Actual first approved Google signup/login reached CEO/Online, user-confirmed. Reload confirmation and unapproved-production-account test were not completed before user stop. Identity signup does not create staff; verified-primary-email/preapproval checks remain. See [record](deployment-preview.md). |
| U-07 | Micropay is selected for required staff SMS; prepared SMS-only token creation/integration is authorized. Staff audience is already confirmed; future WhatsApp is optional alongside SMS. | Preview configured/sending enabled; this hosted QA sent nothing. Production settings saved with sending disabled/no cron. Provider acceptance/delivery needs its own evidence; see [provider record](micropay-integration.md). CEO personal mute/ordinary-staff mandatory SMS rules remain. |
| U-08 | Use neutral staff-facing UI copy; women-only participant references remain feminine. Preserve existing names/data and public marketing copy. | Explicit Terra XHIGH copy pass reviewed and deployed. Representative hosted team neutral roles/compact edit action verified; the earlier full role/device matrix is not freshly repeated. |

The [technical specification](technical-spec.md) records proposed internal contracts; the [implementation plan](implementation-plan.md) ties remaining policy decisions to milestones. The [short Hebrew client questions](client-questions.he.md) omit settled recipient/provider decisions. Latest Preview/production-preparation evidence is in the deployment record; the following browser checkpoints remain historical rather than freshly repeated.

Core implementation and recorded bounded local checks are closed. Chrome 12/Firefox 15 and full isolated 1.64.1/WebKit 27.2 r2370 **15 functional groups** pass, including native exact-draft/reconnect. Current WebKit **15/2/1** retains an automatic transition unconfirmed within ten seconds and strict no-errors failure with 44 CORS-shaped diagnostics. Visible Continue works; no cause, unexpected failed RSC chain or concrete app bug was established. Earlier focused/old-runtime checkpoints stay separate; vendor probe, Safari/iPhone, client/policy/production `proxy_url` gates remain distinct.

The subsequent focused settled audit is **6/1/1**: eight page audits/nine controlled text-resize views pass; raw Base UI guard findings/manual AT remain. Two deterministic quota injections and populated blocked scheduled-route proof pass separately. No app/core/SW change, fresh full-matrix aggregate, native-zoom/clipping or full WCAG acceptance is claimed.

## Provisional defaults used by the implementation

These defaults allow implementation and testing to continue. They are **not client-confirmed policy** and do not remove the associated acceptance decisions. Source and verification status are mapped in [readiness](readiness.md).

| Default | Current behavior | Decision still needed |
| --- | --- | --- |
| Cadence | Seven local calendar days at the same time in `Asia/Jerusalem`; overdue at equality. A late chosen appointment warns and does not move the deadline. | D-02: arithmetic, boundaries, appointment policy, response deadline. |
| Assignment and scope | CEO replaces an existing primary mentor. A coordinator makes initial assignments within their own team; missing scope fails closed. | D-03/D-05: reassignment process and coordinator ceiling. |
| Authority | CEO controls access grants, protection/unlock, lifecycle changes, logical deletion/restore, and staff authority changes. Grants require current central acceptance before increasing access. | D-05/D-06: delegation and protection granularity. |
| Automatic CEO protection | Participant creation protects supplied keys; an empty key set adds no protection. Updates protect submitted keys; assignment/lifecycle protect their own fields. Delete/restore preserve protection. Existing whole locks never auto-narrow; explicit selected/whole commands remain authoritative. | D-06: provisional granularity. Current local/Zty bounded browser proof and recorded PG scope are mapped in readiness; client/device acceptance remains separate. No implicit unlock. |
| New participant input | Fresh create forms omit blank fields. Updates still express an intentional clear, and previously prepared commands keep their original immutable identity/payload. This changes fresh input normalization, not server protection rules or existing locked data. | Current Zty Chrome strict-19/native proof and Firefox/updated-WebKit exact-draft proof pass within their mapped scopes. Historical broad checks remain separate; client/device acceptance is not claimed. |
| Contact cycle and schedule protection | CEO contact/correction/review protects the contact object. New completed contact starts a cycle and preserves prior scheduling history; CEO `record_contact` adds no permanent appointment lock. Explicit/reschedule/correction schedule locks still require CEO release. | D-06: provisional granularity. Current local/Zty native-contact proof and recorded PG scope pass; client/device acceptance remains separate. Existing locks stay enforced. |
| Lifecycle and deletion | Pause/close retain history, cadence anchor and appointment, and cancel unsent reminders. Resume preserves the deadline. Inactive participants reject new contact, assignment and rescheduling; authorized historical correction, review, profile maintenance and manual color remain available subject to protection. Deletion is a reversible tombstone; there is no hard purge. | D-03/D-06/D-14: lifecycle effects, retention, purge and restore policy. |
| Correction/review | Mentors correct their own scoped reports; management can correct or invalidate scoped reports. Reasons and revision tokens are required. History and review attribution survive; an affected appointment may require explicit review. | D-04: correction authority, reporting completeness and approval effect. |
| Offline access | Prepared authorized working set, server-issued lease bounded to at most 24 hours, configurable within that ceiling. All domain commands can queue; local projection never increases accepted read/edit authority. | D-07/D-13/D-14: supported devices, validity and storage guarantee. |
| Restricted local work | Changed identity/authority, expiry or denied access locks pending work in quarantine. Recovery requires fresh online authorization of the same identity/membership and explicit action; inaccessible work remains locked. Recovered intents require review and a fresh action. Explicit logout warns before discarding local work. | D-07/D-08/D-14: recovery/retention and ordinary conflict policy. |
| Reminder routing | Implemented scoped default routes to responsible mentor, coordinator and CEO; CEO can configure all-staff routing. Content is minimal; participants/developer are not recipients. Ordinary staff cannot mute required SMS. | Staff SMS audience/provider are settled in U-07. D-11 concerns remaining timing/repetition/quiet periods/content. |
| Monthly oversight | Internal scoped activity counts distinguish occurrence and receipt times; management notes/review retain version history and CEO protection. There is no wellbeing score. | D-12/D-14: final report, audience and export scope. |

Provider selection, credentials, hosted scheduling and production authentication are external integration blockers. Browser/accessibility targets, business-policy approval, acceptance, handover and support are separate non-code gates; they are not described as missing credentials.

Deployment preparation should use the latest Vercel CLI because the Vercel plugin reported the installed CLI outdated. This recommendation does not authorize a global tool update or deployment during current testing.

The scope audit found no additional settled staff-workflow gap. Ancillary features remain open/proposed deferrals. Scheduled GET code/review/empty-runtime and bounded browser proof pass; no hosted cron or real adapter exists. Client/policy, service/account and untested-device gates remain. Recorded core/contact PG proof predates optional dispatcher wiring; newer local/runtime/browser proof is not a fresh PG-suite run. The retained diagnostic is documented without an unsupported cause or new code-fix requirement.

## Confirmed decisions

| ID | Decision | Latest clarification |
| --- | --- | --- |
| C-01 | First completed contact is due within seven days of assignment to a mentor. | Client explicitly selected assignment as the starting point. |
| C-02 | Later completed contacts are required at least once every seven days. | A calendar-week quota is not the stated rule. |
| C-03 | Phone conversations and in-person meetings count; no-answer attempts do not. | Attempts do not reset successful-contact timing. |
| C-04 | After each completed contact, choose the next date/time. Extra contact does not accumulate another required meeting. | Additional interest/contact is encouraged. |
| C-05 | Mentors choose green/orange/red themselves; contact tracking does not wait for management approval. | Later answers replace the earlier green/yellow/orange description. Colors describe follow-up activity. |
| C-06 | One primary mentor owns each participant; mentors see their assigned participants. | Reassignment involves the CEO. |
| C-07 | Coordinators and CEO can view/edit/approve; mentors can view/edit but not approve. | Exact coordinator scope remains open. |
| C-08 | CEO has final authority, controls deletion/revocation, may broaden access, and CEO changes are protected. | Later answer replaces the earlier possibility of developer-only final change approval. |
| C-09 | CEO and coordinators add staff. | Later answer expands the earlier CEO-only onboarding description. |
| C-10 | Participants do not enter mentoring records or questionnaires and receive no system messages. | A participant joining-request process is separately deferred/undefined. |
| C-11 | Staff SMS is mandatory except the CEO may mute their own messages. | Later answer establishes this exception. No developer recipient. |
| C-12 | Authorized viewing/editing/autosave must work offline. | Exact availability, permission-validity, and persistence guarantees still need definition. |
| C-13 | In an offline conflict with a CEO change, retain CEO version as authoritative and preserve mentor revision for review. | Client explicitly accepted the concrete conflict example. |
| C-14 | Partial profiles are allowed, and historical information remains unless the CEO decides to delete. | Minimum viable identity fields/deletion policy remain open. |
| C-15 | Staff enter narrative observations; management evaluates success against the organization's mission and reviews monthly. | No numeric outcome target or survey instrument was agreed. |
| C-16 | Hebrew is default; sign-in uses username/password plus a one-time code. | English staff UI and OTP channel not committed. |

## Recommendations in this draft

| ID | Recommendation | Why it matters | Status |
| --- | --- | --- | --- |
| P-01 | Show manual mentor color separately from calculated seven-day compliance. | Preserve manual authority while making missed contact visible. | Needs CEO agreement; do not implement as an automatic color change. |
| P-02 | One active next required appointment per participant. | Extra successful contact updates rather than duplicates the duty. | Representation proposed; non-accumulation confirmed. |
| P-03 | Rescheduling never resets the completed-contact clock. | A date change is not evidence of contact. | Proposed operational rule. |
| P-04 | Route reminders by primary mentor and oversight scope. | Avoid unnecessary disclosure and organization-wide message volume. | Recipient interpretation not confirmed by “all staff.” |
| P-05 | Use separate draft, local-save, synchronized, and review states. | Avoid presenting unfinished or unsent records as centrally accepted. | UX recommendation. |
| P-06 | Preserve review/audit attribution when records are corrected. | Maintain the meaning of an approval and protected CEO action. | Detailed revision/reapproval process open. |
| P-07 | Launch with the core contact/assignment/oversight system; defer general task/calendar/report-builder capabilities. | Gives the first release a reviewable boundary. | Scope proposal, not an agreed exclusion. |

## Decisions needed before a delivery commitment

“Open” does not mean approved or out of scope. A staff workflow can be wireframed while these decisions are pending, but the relevant implementation cannot receive final acceptance until its rule is settled.

| ID | Topic and impact | Owner | Client question |
| --- | --- | --- | --- |
| D-01 | Manual color versus calculated deadline; affects dashboard and escalation. Launch-blocking. | CEO with coordinators | האם להציג בנפרד את הצבע שהחונכת בחרה ואת החיווי המחושב של עמידה בשבעת הימים, כך שאיחור יישאר גלוי גם אם נבחר ירוק? |
| D-02 | Exact deadline arithmetic, equality, appointment limits, and response time. Launch-blocking. | CEO; technical recommendation by developer | האם שבעה ימים הם אותו יום ושעה בשבוע הבא לפי שעון ישראל גם כשעוברים שעון? האם מותר לקבוע מועד מאוחר יותר עם אזהרה, ותוך כמה זמן הרכזת צריכה לטפל באיחור? |
| D-03 | Reassignment and lifecycle timing; affects accountability and reminder eligibility. Launch-blocking. | CEO/coordinators | האם החלפת חונכת משמרת את מועד המעקב הקיים? מה קורה לתזכורות כאשר חניכה מסיימת שירות, מפסיקה ליווי או חוזרת אליו? |
| D-04 | Weekly reporting and management approval; affects completion and correction. Launch-blocking. | CEO/coordinators | האם תיעוד המפגש נחשב גם לדיווח השבועי? אילו פרטים חייבים למלא, ומה קורה אם רכזת מחזירה דיווח לתיקון לאחר שכבר נספר כמפגש? |
| D-05 | Coordinator and staff-grant scope; affects access model. Launch-blocking. | CEO | האם רכזת רואה את כלל החניכות והחונכות או רק את הצוות שבאחריותה? אילו תפקידים והרשאות היא רשאית להעניק בעת צירוף איש צוות? |
| D-06 | CEO protection/delegation and deletion; affects online/offline writes. Launch-blocking. | CEO | כשמנכ״ל משנה מידע, האם ננעל כל הכרטיס או רק המידע ששינה? איך הוא מתיר שינוי בהמשך, והאם מחיקה היא הסתרה עם היסטוריה או מחיקה לצמיתות? |
| D-07 | Offline availability, permission validity, cache/session lifetime, and recovery. Launch-blocking. | CEO plus technical design | האם נדרשת עבודה ללא אינטרנט גם לאחר סגירת הדפדפן ופתיחתו מחדש, ובכמה מכשירים? לכמה זמן מותרת גישה ללא חיבור, ומה עושים בעבודה שטרם נשלחה אם בינתיים בוטלה ההרשאה או הוחלפה החונכת? |
| D-08 | Concurrent ordinary edits and CEO conflict-review responsibility. Launch-blocking. | CEO/coordinators | מי בודק את הגרסה שנשמרה בנפרד לאחר התנגשות עם שינוי של המנכ״ל? ומה צריך לקרות כאשר שתי נשות צוות אחרות עורכות את אותו מידע במקביל? |
| D-09 | Participant creation/intake and service fields; affects forms and validation. Launch-blocking for included intake. | CEO/coordinators | האם בגרסה הראשונה הצוות מזין חניכות ידנית בלבד, או שנדרש גם טופס בקשת הצטרפות לחניכה? מהם פרטי הזיהוי המינימליים ומהם השדות הנוספים לשירות צבאי? |
| D-10 | OTP channel, enrollment, recovery, and offline authentication boundary. Launch-blocking. | CEO with developer | לאן נשלח קוד הכניסה החד־פעמי, האם הוא נדרש בכל כניסה, ואיך איש צוות משחזר גישה אם הטלפון אינו זמין? האם רישום עצמי מיועד לחניכות, לצוות או לשניהם, ומי מאשר אותו? |
| D-11 | Remaining notification timing/content. Staff audience/Micropay are confirmed; future WhatsApp is optional. | CEO/coordinators | מתי שולחים תזכורות חוזרות, באילו שעות, ואיזה מידע מותר לכלול בהודעה? |
| D-12 | Feature boundary and configuration scope. Launch-blocking for SOW. | CEO | אילו רכיבים נכללים בגרסה הראשונה: ניהול משימות, יומן מלא, מסמכים, דוח חודשי ואנגלית? אילו הגדרות מנהלים חייבים לשנות בעצמם? |
| D-13 | Devices, browser support, accessibility, and scale. Launch-blocking for acceptance. | CEO and developer | האם כעשרה מתייחס לאנשי צוות או לחניכות, וכמה חניכות צפויות? באילו מכשירים ודפדפנים חייבים לבדוק, ומהן דרישות הנגישות וזמני התגובה המוסכמים? |
| D-14 | Retention, privacy, device storage, and internal monthly review scope. Launch-blocking for sensitive-data handling. | CEO | כמה זמן שומרים נתונים ומידע מקומי במכשירים, מי רשאי לראות את הסקירה החודשית, והאם נדרשים דוחות להורדה או רק צפייה פנימית? |
| D-15 | Acceptance/handover/support, code/data handoff and delivery dates. Production account ownership is settled by U-03; provisioning/handoff remains. Launch-blocking for acceptance. | CEO and developer | מהם תנאי הקבלה, משך בדיקת המערכת והתמיכה לאחר המסירה? מה נמסר לצוות בחשבונות שבבעלות הארגון, והאם יש מועד השקה מחייב? |

These questions form an internal decision backlog, not a request that the client complete another long questionnaire immediately. Resolve them in focused product/technical walkthroughs, using the screens and acceptance scenarios as concrete examples.

## Change record

Each accepted change should record the requirement/decision ID, previous rule, replacement rule, CEO decision, affected screens/data/acceptance cases, delivery impact, and effective version. A proposal becomes confirmed only when the authorized decision is recorded; this file does not manufacture sign-off.
