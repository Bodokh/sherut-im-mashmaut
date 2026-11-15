# Client requests of 15 November 2026 (tasks 1-7, 9, 10)

Task numbers match the client list. Item 8 (brochure) is not code and is not covered.

| # | Request | Result |
| --- | --- | --- |
| 1 | CEO permanently deletes a mentee | Already implemented (`permanently_delete_participant`, typed-name confirmation, CEO-only on the server). Now also purges the mentee's tracking card/reports. |
| 2 | Mentor list follows the selected coordinator | The assignment form lists the coordinator first and only that team's mentors. The server rejects a mentor/coordinator mismatch (`assign_participant`, field `mentorId`). |
| 3 | Mentors/mentees per coordinator | `/staff/coordinators` (nav: "צוותי הרכזות" / the coordinator's own team). CEO sees every coordinator side by side with totals; a coordinator sees her team. |
| 4 | Organization tree | `/staff/tree` (CEO only): coordinators → mentors → mentees, with links to the cards and expand/collapse all. |
| 5 | SMS reminders | Already implemented (3 days = 4,320 minutes before and at the scheduled contact, assigned mentor and coordinator only, message asks them to call and file the report and carries the mentee's name and phone, renewed after a report). Added a dry-run preview (below). |
| 6 | Remove "פלוני אלמוני" | The string does not exist in the repository. Migration `016` removes it from a database (see below). |
| 7 | Gallery | Already implemented (nav item in Hebrew/English, home-page section, editable list in `lib/gallery.ts`). |
| 9 | Coordinator management scope | Server-scoped: a coordinator opens every tracking card of the mentees and mentors in her team, sees their phone/email, and files contact reports for her mentors' mentees. |
| 10 | Separate mentee and mentor tracking cards | New `כרטיס מעקב` for mentees (tab on the mentee card) and for mentors (`/staff/mentors/[id]`). Only the CEO and coordinators can read or write them. |

## Authorization (server side)

- `save_tracking_card` and `record_tracking_report` are rejected for mentors before any database work. A coordinator is limited to mentees she is responsible for and mentors whose `coordinator_id` is her. The CEO is unrestricted.
- `getWorkspace` only returns `trackingCards` to the CEO and coordinators, for the participants and mentors already in the actor's scope.
- Staff phone and email are returned to the CEO, to the person themselves and to a coordinator for her own mentors; everyone else receives them masked.
- Cards use optimistic versions (`expectedCardVersion`); tracking commands are online-only and never enter the offline queue.
- Interpretation of task 10: mentors keep the existing contact-report form for their own mentees. The new tracking cards (management follow-up on mentees and mentors) are restricted to the CEO and coordinators.

## Migrations (apply in order, additive and idempotent)

| File | Effect |
| --- | --- |
| `014_tracking_cards.sql` | New tables `tracking_cards` and `tracking_reports`. No existing row is changed. |
| `015_assignment_coordinator_backfill.sql` | Fills a NULL `assignments.coordinator_id` on active assignments from the mentor's current coordinator, so coordinators see and are reminded about those mentees. Never overwrites a coordinator. |
| `016_remove_placeholder_record.sql` | Mentee cards named exactly "פלוני אלמוני" (whitespace-normalized): purged when empty, otherwise moved to the recycle bin attributed to an active CEO (nothing with history is destroyed). Staff with that name, no login and no responsibilities are deactivated. Skips anything with an in-flight reminder and reports it as a NOTICE. |

```sh
npm run db:mentoring:migrate   # uses MENTORING_DATABASE_URL_UNPOOLED
```

## Reminder dry run (task 5)

```sh
MENTORING_DATABASE_URL=... node --conditions=react-server --experimental-strip-types \
  scripts/mentoring/preview-reminders.mjs --development [--at 2026-11-20T08:00:00Z] [--due-only] [--json] [--include-personal-data]
```

The script reads the development database in a READ ONLY transaction, uses the production planner, recipient selection and message templates, never loads an SMS transport and never sends. Mentee names/phones are redacted unless `--include-personal-data` is passed. It refuses to run when `NODE_ENV` or `VERCEL_ENV` is `production`.

## Real SMS configuration (unchanged by this work)

Sending needs `MENTORING_SMS_PROVIDER=micropay`, `MENTORING_MICROPAY_TOKEN`, `MENTORING_MICROPAY_SENDER` and `MENTORING_SMS_SENDING_ENABLED=true`. The five-minute cron in `vercel.json` also needs `CRON_SECRET` and `MENTORING_REMINDER_ACTOR_ID` (an active CEO or coordinator membership id) in the production environment. Without them nothing is sent.
