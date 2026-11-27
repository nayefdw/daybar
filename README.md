# Daybar

**A self-hosted day planner**: tasks, events, habits and notes on one Today page, an Upcoming board, a calendar with day, days, week and month views, and Quick Add that turns one sentence into an item ("Call Anna tomorrow 10:00 #family").

Daybar is a fork of [flowplan](https://github.com/yannicschuller/flowplan) by Yannic Schuller. flowplan's documents, databases, whiteboards and journal stay in Daybar and sit below the planner in the sidebar; notes are flowplan documents, and day notes use the journal.

## What it does

- **Today**: a day strip, a summary of the day, a This week card, the day note with the day's items as lines, and the leftovers from yesterday with "Move to today" or "Move all".
- **Upcoming**: the next 30 days as a board of day columns (drag a card to another day, it keeps its time) or as a list.
- **Calendar**: Day, 2–5 Days, Week and Month; an all-day band and This week / This month strips; click or drag to create, drag to move and resize in 15-minute steps.
- **Tasks**: Inbox, Overdue, each day, weeks and months, Waiting, Someday and Done, as a list, board or table, with grouping, sorting and filters. Priorities, in progress, waiting until (with follow-ups), durations, locations, reminders, nested subtasks, tags, one folder, favorites.
- **Habits**: every N days, weeks, months or years, on chosen weekdays or a day of the month, ending never, on a date or after N times; on-time streaks, a 7-day strip and the monthly rate.
- **Quick Add**: one grammar for the ⌘K palette and the capture lines (`#tag`, `$folder`, `!`/`!!`/`!!!`, `~30m`, days, times, weeks, months, Someday, repeat phrases).
- **ThisDay sync**: upload a ThisDay export to import it; an authenticated `to-thisday.json` outbox for the iPhone Shortcut. The old single-page Daybar's JSON export imports too.

The planner's design and the feature map it follows are in [docs/daybar](docs/daybar): [architecture.md](docs/daybar/architecture.md), [woday-feature-map.md](docs/daybar/woday-feature-map.md) and [STATUS.md](docs/daybar/STATUS.md).

## Run it

The image is built for `linux/amd64` on every push to `main`:

```bash
docker run -d --name daybar -p 3000:3000 -v daybar-data:/app/data ghcr.io/nayefdw/daybar:latest
```

Then open `http://localhost:3000` and sign up: the first account administers the instance. Configuration is flowplan's (`.env.example`, [docs/upstream/README.md](docs/upstream/README.md)); the defaults suit a small server (SQLite, one container).

## Windows desktop

Daybar can also run as a self-contained Windows 10/11 x64 application.
The Windows build includes the local server, SQLite support and Node.js;
Docker and a separate Node installation are not needed to use it.

Download the **Daybar-Windows-x64** artifact from a successful
[Windows desktop build](https://github.com/nayefdw/daybar/actions/workflows/windows-desktop.yml),
extract it, and run `Daybar-0.12.0-Setup-x64.exe`. The separate Windows ZIP
can be extracted and launched with `Daybar.exe` instead.

See the [Windows guide](docs/daybar/windows.md) for first launch, data,
backups, limitations and building from source.

## Develop from source

```bash
npm ci
npm run dev
```

```bash
npm run typecheck
```

```bash
npm test
```

## Licence and credits

Daybar is free software under the [GNU AGPL-3.0](LICENSE), like flowplan. Whoever runs a changed version for others offers them its source code; Settings → About Daybar links the source of what runs.

flowplan © Yannic Schuller and contributors. flowplan's own README, with its documentation, notices and credits, is kept in [docs/upstream/README.md](docs/upstream/README.md) ([Deutsch](docs/upstream/README.de.md)); third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [licenses/](licenses).

