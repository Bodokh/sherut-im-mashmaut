# Micropay integration contract

Updated 27 October 2026. The user selected **Micropay for staff SMS**, with WhatsApp planned for later. The adapter and registry are implemented and independently reviewed. A dedicated token has SMS permission enabled and the other five capabilities disabled; it is stored privately. Existing-account Preview configuration is present; final deployment/authentication acceptance remains in progress. Client-owned production handoff remains separate.

## Confirmed evidence

- The real read-only balance API returned HTTP 200, `status:1`, `message:"OK"`, `action:"credit"`, with available credit.
- Exactly one explicitly approved controlled SMS was sent through the real registry/adapter and accepted with a valid task ID. Micropay's outgoing report showed **one message, one segment**, marked `נשלח בהצלחה`; the user confirmed receipt. This did not mutate domain records or exercise the scheduled dispatcher.
- The test requested `Mashmaut`, but Micropay substituted the account's verified personal sender. The account currently permits only that verified sender. The requested brand **`IMASHMAUT` is not unlocked or verified**; configuring its value does not remove this provider restriction. Provider contact has not been authorized.

## SMS boundary

The [Micropay adapter](../../lib/mentoring/features/reminders/micropay.ts) implements [ReminderTransport](../../lib/mentoring/features/reminders/transport.ts) with one immediate request per canonical staff reminder:

`POST https://www.micropay.co.il/extApi/scheduleSms.php`

Use `Content-Type: application/json` and body fields `token`, `from`, `msg`, `list`. `list` contains one validated staff phone; `msg` uses the minimal reminder. JSON requires no `post=2`. The token stays server-only; the adapter prevents redirects, retries and secret/payload logging. Provider-side scheduling and distribution lists are excluded. Sender permissions require account confirmation. [Authentication](https://site.micropay.co.il/api/auth.php), [JSON conventions](https://site.micropay.co.il/api/conventions.php), [SMS contract](https://site.micropay.co.il/api/send-sms.php)

Require `status:1`, `message:"OK"` and a valid `data.taskId` for `provider_accepted`; this does not prove delivery. Explicit parameter rejection can be `failed`. Timeout, malformed/missing reference, or an unrecognized response remains `uncertain`.

No provider idempotency/client-reference field is documented; the dispatcher's local key cannot provide provider deduplication. Never automatically resend an uncertain handoff. `taskStatus.php` requires the returned `tid`; no local-key lookup is documented. Single-recipient campaigns are not retained: `na` cannot prove non-sending, and `done` cannot prove handset delivery. Provider reconciliation is not implemented. [SMS contract](https://site.micropay.co.il/api/send-sms.php), [Status contract](https://site.micropay.co.il/api/campaign-status.php)

## Delivery receipts

Callbacks are not implemented/configured. Future DLRs should use POST JSON, correlate `msgid` and the original dispatch `phone`, and deduplicate retries. Status is `ok` or `nd`. Existing attempts lack a phone snapshot; settle historical-recipient correlation. Account-level settings may affect other integrations. Authentication is undocumented and must be confirmed before trusting receipts. [DLR contract](https://site.micropay.co.il/api/webhook-dlr.php)

Current [dispatcher reconciliation](../../lib/mentoring/features/reminders/dispatcher.ts) only advances known acceptance to delivery. Negative receipts require a reviewed distinction between delivery failure and send rejection. The confirmed test receipt does not establish automated DLR support.

## Configuration and remaining acceptance

Preview uses `MENTORING_SMS_PROVIDER=micropay`, sensitive `MENTORING_MICROPAY_TOKEN`, `MENTORING_MICROPAY_SENDER`, and exact `MENTORING_SMS_SENDING_ENABLED=true`. No cron or reminder actor is configured. Provider readiness alone does not run scheduled reminders.

Credential checks use the **read-only** JSON balance request to `scheduleSms.php`, with `token` and `act:"credit"`. Never log secrets/raw responses. `validate:1` on send APIs still sends. [Balance contract](https://site.micropay.co.il/api/sms-balance.php)

Remaining gates: branded-sender unlock, final hosted acceptance, separately authorized scheduled-job testing/configuration, and authenticated DLR handling. Keep the single controlled-send evidence distinct from complete reminder-workflow acceptance.

## Future WhatsApp

WhatsApp remains **not implemented, ready or activated**. It needs business/sender activation, WhatsApp-scoped credentials and an approved reminder template. Proactive reminders use `scheduleWa.php`; `sendWa.php` is restricted to a reply window. Check template `sendable` and `issue` before activation. [Setup](https://site.micropay.co.il/faq.php), [Templates](https://site.micropay.co.il/api/send-whatsapp.php), [Template discovery](https://site.micropay.co.il/api/whatsapp-templates.php), [Freeform](https://site.micropay.co.il/api/send-whatsapp-free.php)

Add independent channel identity/readiness when implementing WhatsApp. Its acceptance must never satisfy mandatory SMS. Callback authentication and ordering need separate verification. [WhatsApp callbacks](https://site.micropay.co.il/api/webhook-wa-status.php)
