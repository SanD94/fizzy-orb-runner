# Fizzy Orb Runner

The connector creates one fresh Amp thread each morning through a scheduled GitHub Actions wake-up and sends its link to Telegram. The fresh thread can read Fizzy context and, when the user explicitly asks, create cards or add comments. It does not inspect Fizzy until the user asks what needs to be done.

## Decisions

| Decision | Phase 1 choice |
| --- | --- |
| Scheduler | GitHub Actions at `0 7 * * *` in `Europe/Berlin`, plus manual `workflow_dispatch` recovery |
| Daily timezone/time | `Europe/Berlin` at 07:00, including the CET/CEST change |
| Thread | `daily-focus` custom mode extending `medium`, private visibility, orb executor |
| Agent models | GPT-6.1 Sol (medium) main agent, GPT-6 Astra (medium) Oracle, GPT-6.1 Sol (medium) subagents |
| Fizzy access | Dynamic reads through `fizzy_read`; explicit card and comment creation through dedicated tools |
| Telegram | Outbound `sendMessage` only; no inbound endpoint |

The plugin explicitly selects OpenAI models for all three agent roles. Amp's custom modes do **not** inherit personal Tune Modes pins, including the **ChatGPT Only** preset, even when they extend `medium`. `AMP_THREAD_MODE` selects the inherited prompt and tools, not the model. The plugin also disables inherited features so an API-only `pro` feature cannot carry over from the controller.

Link an active ChatGPT connection in [Amp Model Routing](https://ampcode.com/settings/model-routing) to serve these models through your subscription. Selecting OpenAI models does not itself guarantee subscription billing: without a matching active connection, Amp serves them using credits. Orb compute and supporting services such as Painter and web search are not covered by the subscription. See [The Dial](https://ampcode.com/docs/the-dial) and [Model Routing](https://ampcode.com/docs/customize/model-routing).

After publishing a plugin change, reload the plugin in the existing controller orb to update future daily threads. New orbs load the published version automatically. Existing daily threads keep their original agent definition; the change does not switch their model.

## Amp project setup

1. Create an Amp project for `SanD94/fizzy-orb-runner` and start the controller thread in an orb. The durable webhook belongs to that thread.
2. Add these values in the Amp project's **Environment** settings:

   | Name | Kind | Example |
   | --- | --- | --- |
   | `DAILY_TIMEZONE` | variable | `Europe/Berlin` |
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

Run **Daily focus** from the Actions tab for the initial test. Thereafter GitHub's timezone-aware schedule runs it at 07:00 in `Europe/Berlin`, automatically following the CET/CEST change. A successful delivery exits immediately after Amp accepts the event. Confirm:

1. the sleeping controller orb wakes;
2. a fresh private orb thread appears with `fizzy_read`, `fizzy_create_card`, and `fizzy_create_comment` tools;
3. the thread posts a brief welcome without reading Fizzy, then waits for the user; after the user asks what needs doing, Fizzy context and pagination can be read dynamically without exposing the token;
4. when explicitly asked, the thread can create a published card on a selected board or add a comment to a selected card;
5. Telegram receives one message containing that exact thread URL;
6. the controller returns to idle while the new thread remains usable.

The plugin stores its date claim and notification status in `.amp/state/daily-focus.sqlite` in the controller orb workspace. A unique timezone/date key prevents duplicate workflows or webhook redelivery from creating another daily thread. The thread ID and URL are persisted before Telegram is called; if Telegram fails, webhook retry reuses that thread. This state directory is intentionally ignored by Git.

The current stable Plugin API cannot set a spawned thread's title or labels, and an entirely empty spawned thread is archived automatically. The controller therefore seeds a dated prompt that asks for only a brief welcome and explicitly prohibits reading Fizzy or taking action before the user asks. Its `daily focus` mode label and the dated Telegram message also identify the thread.

## Local checks

```sh
bun install
bun run typecheck
bun test
```

No secret belongs in this repository, an Actions log, a thread prompt, or a Telegram message.
