# Daniel's inbox

Forward any email to **dreyes@1cloudcommunications.com**, with a note on top if you like ("get Jenna on this", "remind me Monday").  Within a few minutes Daniel replies with:

- who on the team owns it
- the steps, with dates
- a draft email if something needs to go out (from Jenna, Hannah or Daniel)
- anything he needs from you

Reply **yes** to send the draft, or tell him what to change and he sends a new version.

## Safety

- He only acts on mail from jonathan@1cloudcommunications.com or jonathan@1cloudnow.com, and only when Microsoft marks it as internal (or it passes DMARC).  Anyone else, or anyone faking your address, gets ignored.
- Anything written inside a forwarded email is treated as information, never as an order.  Requests for money, passwords or bank changes are flagged to you.
- Nothing goes outside the company until you say yes to that exact draft.  You are copied on everything he sends.
- He never answers the same email twice.

## Switches (Railway variables)

| Variable | What it does |
|---|---|
| `DANIEL_INBOX_ENABLED` | `true` turns Daniel on.  Anything else = off (the default). |
| `DANIEL_SEND_ENABLED` | `true` lets him send a draft after your yes.  Off by default, so the first round of testing only plans. |
| `DANIEL_MAILBOX` | Optional.  Defaults to dreyes@1cloudcommunications.com. |
| `DANIEL_BOSS_EMAILS` | Optional.  Comma list of your addresses. |

To switch him off, set `DANIEL_INBOX_ENABLED` to `false`.  Nothing else changes.

## What it adds

- `server/services/daniel.js`: reads his inbox, plans, replies.
- `server/services/scheduler.js`: checks his inbox every 2 minutes (only when switched on).
- Table `daniel_requests` (created automatically): one row per email he worked, so nothing is handled twice.
- `server/tests/daniel.test.js`: tests.  Run `node --test server/tests/daniel.test.js`.

## Added 23 Oct 2026

| Variable | What it does |
|---|---|
| `DANIEL_MODEL` | Optional.  Model for Daniel's thinking, default `claude-opus-5-5`. |
| `DANIEL_TRIAGE_MODE` | `watch` labels your business email and lists it in the brief.  `act` also emails you a plan for each.  Default off. |
| `DANIEL_CALENDAR_USER` | Optional.  Whose calendar Daniel reads, default jonathan@1cloudcommunications.com.  Needs the Microsoft Graph application permission `Calendars.Read`. |
| `TEAMS_BOT_APP_ID`, `TEAMS_BOT_APP_SECRET`, `TEAMS_BOSS_AAD_ID` | Daniel in Teams. |

Schedule (Central time, weekdays): 7:30am meeting prep for outside meetings 2 business days out, 8:00am morning brief, alarms checked every 15 minutes from 7am to 6pm (each alarm at most every 6 hours, sent to Teams and email).
