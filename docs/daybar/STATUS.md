# Daybar: status

What is built on top of flowplan, and what comes next. The plan is the build order of [woday-feature-map.md](woday-feature-map.md); how the planner is stored and wired is in [architecture.md](architecture.md).

## Phase 1 – Planner core: done

| Area | What works | Where |
| --- | --- | --- |
| Rebrand | Daybar's name, titles, metadata, Open Graph image, PWA manifest (Today, Quick add, Calendar shortcuts), mark and wordmark, sign-in panel, onboarding and welcome page. Settings → About Daybar links Daybar's source (AGPL §13) and credits flowplan; the README says "Daybar is a fork of flowplan by Yannic Schuller", flowplan's README is kept in `docs/upstream/` | `lib/brand.ts`, `components/brand-mark.tsx`, `app/layout.tsx`, `app/manifest.ts` |
| Data model | Dedicated tables (schema 141, SQLite and PostgreSQL): tasks (a day with an optional time, a week, a month or Someday; priority; in progress; waiting until with follow-ups; duration; location; reminder apart from the due day; nested subtasks; tags; one folder; favourite; done), events (start, end, all-day, location, reminder), habits (repeat rule, per-day check-ins, on-time streaks), notes (flowplan documents, optionally pinned to a day), day notes (a journal) | `lib/db.ts`, `lib/daybar/store.ts`, `lib/daybar/repeat.ts` |
| API | `GET /api/planner/state`, `POST /api/planner` (every change, zod-checked, one transaction, the person's own rows only; read tokens refused), `GET /api/planner/day-notes`, ThisDay status and outbox; described in the OpenAPI document (tag "Planner") and the generated SDKs | `app/api/planner/[[...path]]/handler.ts`, `lib/openapi.ts` |
| Shell | The sidebar's planner part (Today, Upcoming, Calendar, Notes, Tasks, Events, Habits; Favorites, Folders and Tags with five items and "View all"), then flowplan's places and page tree; the top bar ("Search, or create anything…" ⌘K, back and forward, New, AI, the right panel's switch); the right panel with its scope menu (Inbox, All, Upcoming, Overdue, Waiting, Today, To schedule) and item details. Today is the start page (`#plan/today`); `#home` is flowplan's | `components/daybar/nav.tsx`, `topbar.tsx`, `panel.tsx`, `details.tsx`, `components/workspace-app.tsx` |
| Today | Day strip (a drop target), "Good morning, you have N events and N tasks", the day note with the day's items as lines, a capture line for the day and the journal's text, "From yesterday" with Move to today and Move all, This week | `components/daybar/today.tsx` |
| Upcoming | 30 days as a board of day columns (drag to another day, keeping the time; "Show more" for long days) or a list | `components/daybar/upcoming.tsx` |
| Calendar | Day, Days (2–5), Week, Month; last view remembered; all-day band with untimed tasks; This week and This month strips; working hours and weekend tint; click for an hour, drag for a span; drag to move and the lower edge to resize in 15-minute steps; drop from the right panel; Delete with undo | `components/daybar/calendar.tsx` |
| Tasks | Inbox, Overdue, each day, weeks, months, Waiting, Someday, Done; List, Board (drop on a day, Inbox, Someday or Done) and Table; group by when, priority, folder, tag or none; sort by time, priority, title or newest; filters as pills | `components/daybar/tasks.tsx` |
| Habits | "N due today · N done today", today's check, rule, on-time streak and best, 7-day strip (log a past day by tapping it), month rate; the repeat editor (every N days/weeks/months/years, weekdays with Weekdays/Weekends, a day of the month, ends never/on a date/after N, reminder time) in the right panel | `components/daybar/habits.tsx`, `repeat-editor.tsx` |
| Notes, Events, folders, tags, favourites | Lists of notes (open as flowplan pages), events (upcoming, past, all), one folder or tag, favourites, and "View all" of folders and tags (create, rename, recolour, delete) | `components/daybar/lists.tsx` |
| Quick Add | Kind badge (Task blue, Event red, Note yellow, Habit orange; click to fix the kind), coloured highlights from the parser's spans, the Create row with a day timeline for timed items, symbol menus for `#` tags, `@` days, `!` priority, `~` duration, `*` repeat and `$` folders, the dialog on ⌘N (task), ⇧⌘N (event) and ⌥⌘N (note), capture lines on the screens, and the ⌘K palette's Create row | `components/daybar/quick-add.tsx`, `bridge.tsx` |
| ThisDay | Upload an export (format 2): ThisDay is the truth for its own items; older exports are refused; one removing many items waits for "Import anyway"; twins (title, day, kind) are adopted; categories become folders, steps subtasks, habit logs check-ins. The outbox `GET /api/planner/thisday/to-thisday.json` (adds and ticks with their keys) for the iPhone Shortcut with a personal API token; fetching marks them sent; "Send again" | `lib/daybar/thisday.ts`, `thisday-server.ts`, `components/daybar/sync.tsx` |
| Old Daybar | The single-page Daybar's JSON backup imports: categories become folders, checklists subtasks, repeating items habits; ThisDay's items stay linked to ThisDay; importing again updates | `lib/daybar/legacy.ts` |
| Image | `ghcr.io/nayefdw/daybar:latest` and `:sha-…` for linux/amd64 on every push to `main`; one worker thread and a 640 MB heap cap by default | `.github/workflows/docker.yml`, `Dockerfile` |
| Tests | Habit rules and streaks, the model's groups and scopes, the server store (ownership, kinds, subtasks, waiting, trash, notes, day notes, settings), ThisDay and the old backup with synthetic exports | `tests/daybar-*.test.ts` |

### How Phase 1 was checked

- `npm run typecheck` and `npm test` (4,894 tests) pass.
- A browser run against the production build (Playwright, synthetic data only): sign up → Today shows the planner; ⌘K's Create row makes an event; ⌘N, ⇧⌘N and ⌥⌘N open Quick Add as a task, an event and a note; the dialog keeps a typed time; the symbol menus insert a day and a priority; ticking a line on Today completes the task and the lines run by time; dragging on Upcoming keeps the time; on the Calendar a click makes an hour-long event, dragging moves it and the lower edge resizes it in 15-minute steps; a habit checked today is on time; a synthetic ThisDay export imports and the outbox lists the adds. No errors in the page. Screenshots at 1280 and 390 px, light and dark.
- `npm run quality`: no accessibility findings; the budgets of the signed-in pages were raised by the planner's part of the shell (see `scripts/quality-check.mjs`).

### Known limits of Phase 1

- **Shortcuts in a browser tab**: ⌘N and ⇧⌘N belong to the browser in a normal tab (new window, private window); they work in the installed app and the desktop app. The top bar's New and the ⌘K Create row work everywhere.
- **Reminders** are stored (tasks, events, habits) but not sent yet: notifications are Phase 2.
- **Done tasks** older than 120 days stay on the server and are not loaded into the planner (the Done group shows the last 30 days).
- **Calendar on touch**: tap a slot to create, tap an item to open it; moving and resizing are mouse and pen gestures (on a phone, change the time in the details).
- **Day note lines**: the day's items show as lines above the journal's text, which is edited in the journal day page; to-do lines typed in the journal are flowplan document tasks, not planner tasks.
- **ThisDay notes** come in as plain text notes (no page); notes made in Daybar are pages.
- **GitHub Actions**: the repository shows no workflow runs yet, so Actions are probably switched off for the fork (Settings → Actions → General). Until they run, no image is published; once `docker.yml` has run, make the `daybar` package public under the account's Packages or log the server in to ghcr.io.
- **Upstream CI**: `visual.yml` compares screenshots with flowplan's baselines and runs on every push to main; it fails now that the start page is Daybar's, until its baselines are made anew or the workflow is switched to manual runs (the owner's call). CI's `help-docs` job fails on a push when flowplan-docs changes upstream.

## Next

### Phase 2 – Organizing and settings

- Views and filters saved as tabs (global, folder, tag), favourites reordering, Files, the planner's Trash (restore and empty).
- Events page as list, board and table with grouping; Analytics (monthly tiles, daily activity).
- Settings: week start, time format, working hours, default calendar view, auto-move unfinished tasks, open items in panel / full view / overlay, completion sound.
- Notifications: task reminders, due times, waiting tasks coming back, events with lead time, habit reminders, the daily briefing (flowplan's web push and notification feed).
- Recurring tasks; history log; convert note ↔ task; copy as.

### Phase 3 – AI

- Assistant chat with the planner tools (agenda, free time, tasks, habits, notes, search, tags, folders, views, trash, stats), approvals (Apply, Always allow, Dismiss) and agent mode (morning briefing, meeting heads-up, evening wind-down, weekly review).
- Magic Lines in notes; planner tools in flowplan's MCP server.

### Phase 4 – Integrations and polish

- Google Calendar two-way (OAuth); Todoist, TickTick and Linear (API tokens).
- Weather on Today (Open-Meteo), import center, CSV export of everything.
- Phone layout polish (tab bar with Today, Calendar, Notes, Tasks, Events; swipe to complete or delete), desktop app with launcher and tray.
