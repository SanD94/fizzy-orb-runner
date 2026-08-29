# Fizzy Orb Runner

Phase 0 validates the thin path from a manual GitHub Actions run to a durable Amp webhook, a fresh orb thread, and one outbound Telegram notification. It also performs a read-only, paginated Fizzy card listing before creating the thread.

## Decisions for the smoke path

| Decision | Phase 0 choice |
| --- | --- |
| Scheduler | Manual `workflow_dispatch` only in Phase 0; Phase 1 cron choice is `0 9 * * *` |
| Daily timezone/time | `UTC` at 09:00 by default; timezone remains configurable with `DAILY_TIMEZONE` |
| Card selection | All accessible cards, optionally filtered by columns; oldest `created_at` first; at most 10 cards and two API pages |
| Thread | `medium` mode, private visibility, orb executor |
| Fizzy failure | Create the thread with an explicit unavailable note |
| Fizzy access | Read-only personal token; the plugin only sends `GET /:account/cards` |
| Telegram | Outbound `sendMessage` only; no inbound endpoint |

## Amp project setup

1. Create an Amp project for `SanD94/fizzy-orb-runner` and start the controller thread in an orb. The durable webhook belongs to that thread.
2. Add these values in the Amp project's **Environment** settings:

   | Name | Kind | Example |
   | --- | --- | --- |
   | `DAILY_TIMEZONE` | variable | `UTC` |
   | `AMP_THREAD_MODE` | variable | `medium` |
   | `AMP_THREAD_VISIBILITY` | variable | `private` |
   | `FIZZY_BASE_URL` | variable | `https://app.fizzy.do` |
   | `FIZZY_ACCOUNT` | variable | optional override; defaults to `6103582` |
   | `FIZZY_COLUMN_IDS` | variable | optional comma-separated Ready/active column IDs |
   | `FIZZY_MAX_CARDS` | variable | `10` |
   | `TELEGRAM_CHAT_ID` | variable | intended chat ID; `TELEGRAM_ALLOW_FROM` is also accepted |
   | `DAILY_TRIGGER_SECRET` | secret | a new random value |
   | `FIZZY_API_TOKEN` | secret | a read-only Fizzy personal token |
   | `TELEGRAM_BOT_TOKEN` | secret | BotFather token |

3. Restart the orb processes after saving the values. Amp loads [the project plugin](.amp/plugins/daily-focus.ts), registers the durable endpoint, and logs only `Daily focus webhook registered`.
4. In the controller thread, run the command **Daily focus: copy webhook URL**. Copy the value from the dialog; it is not written to the thread or plugin logs.

## GitHub setup and smoke test

In the repository's **Actions secrets**, add:

- `AMP_WEBHOOK_URL`: the private URL copied from the Amp command;
- `DAILY_TRIGGER_SECRET`: the same random value configured in the Amp project.

Run **Daily focus smoke test** from the Actions tab. A successful run exits immediately after Amp accepts the event. Confirm:

1. the sleeping controller orb wakes;
2. Fizzy receives only card-listing GET requests and a second page is followed when its `Link` header contains `rel="next"`;
3. a fresh private orb thread appears with the Fizzy context (or an explicit unavailable note);
4. Telegram receives one message containing that exact thread URL;
5. the controller returns to idle while the new thread remains usable.

The webhook is at-least-once. Phase 0 intentionally does not claim a local date or persist notification status; do not use it as a schedule until Phase 1 adds that state. A Telegram failure after thread creation can therefore produce another test thread if Amp retries the event.

## Local checks

```sh
bun install
bun run typecheck
bun test
```

No secret belongs in this repository, an Actions log, a thread prompt, or a Telegram message.
