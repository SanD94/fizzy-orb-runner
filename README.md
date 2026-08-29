# Fizzy Orb Runner

The connector creates one fresh Amp thread each morning through a scheduled GitHub Actions wake-up and sends its link to Telegram. The fresh thread can read Fizzy context and, when the user explicitly asks, create cards or add comments. It does not inspect Fizzy until the user asks what needs to be done.

## Decisions

| Decision | Phase 1 choice |
| --- | --- |
| Scheduler | GitHub Actions at `0 9 * * *` (UTC), plus manual `workflow_dispatch` recovery |
| Daily timezone/time | `UTC` at 09:00 by default; timezone remains configurable with `DAILY_TIMEZONE` |
| Thread | `medium` mode, private visibility, orb executor |
| Fizzy access | Dynamic reads through `fizzy_read`; explicit card and comment creation through dedicated tools |
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
   | `TELEGRAM_CHAT_ID` | variable | intended chat ID; `TELEGRAM_ALLOW_FROM` is also accepted |
   | `DAILY_TRIGGER_SECRET` | secret | a new random value |
   | `FIZZY_API_TOKEN` | secret | a Fizzy personal token with **Read + Write** permission |
   | `TELEGRAM_BOT_TOKEN` | secret | BotFather token |

3. Restart the orb processes after saving the values. Amp loads [the project plugin](.amp/plugins/daily-focus.ts), registers the durable endpoint, and logs only `Daily focus webhook registered`.
4. In the controller thread, run the command **Daily focus: copy webhook URL**. Copy the value from the dialog; it is not written to the thread or plugin logs.

## GitHub setup and daily run

In the repository's **Actions secrets**, add:

- `AMP_WEBHOOK_URL`: the private URL copied from the Amp command;
- `DAILY_TRIGGER_SECRET`: the same random value configured in the Amp project.

Run **Daily focus** from the Actions tab for the initial test. Thereafter it runs at 09:00 UTC. A successful workflow exits immediately after Amp accepts the event. Confirm:

1. the sleeping controller orb wakes;
2. a fresh private orb thread appears with `fizzy_read`, `fizzy_create_card`, and `fizzy_create_comment` tools;
3. the thread is initially empty and waits for the user; after the user asks what needs doing, Fizzy context and pagination can be read dynamically without exposing the token;
4. when explicitly asked, the thread can create a published card on a selected board or add a comment to a selected card;
5. Telegram receives one message containing that exact thread URL;
6. the controller returns to idle while the new thread remains usable.

The plugin stores its date claim and notification status in `.amp/state/daily-focus.sqlite` in the controller orb workspace. A unique timezone/date key prevents duplicate workflows or webhook redelivery from creating another daily thread. The thread ID and URL are persisted before Telegram is called; if Telegram fails, webhook retry reuses that thread. This state directory is intentionally ignored by Git.

The current stable Plugin API cannot set a spawned thread's title or labels. Its `daily focus` mode label and the dated Telegram message identify the thread without sending an artificial first prompt that would start the agent before the user asks a question.

## Local checks

```sh
bun install
bun run typecheck
bun test
```

No secret belongs in this repository, an Actions log, a thread prompt, or a Telegram message.
