# Daybar's planner on flowplan: architecture

Daybar is flowplan with a personal day planner on top. This page records how the planner is stored and wired into flowplan, and why. The feature map it serves is [woday-feature-map.md](woday-feature-map.md); what is built is in [STATUS.md](STATUS.md).

## The decision: dedicated planner tables

flowplan offered two places for tasks and events:

1. **Personal task and event databases**: a database page per person (`databases` with `fields` and `views`, records in `rows.cells` as JSON keyed by field id), as "My tasks" (`lib/my-task-target.ts`) and the task databases do.
2. **Dedicated tables** for the planner.

Daybar uses **dedicated tables** (`planner_*`, schema 141 in `lib/db.ts`), with notes and day notes on flowplan's own pages:

| | Personal databases | Dedicated tables (chosen) |
| --- | --- | --- |
| The planner's fields | Periods (week, month, Someday), waiting with follow-ups, a reminder apart from the due day, in progress, one folder, favourites and habit check-ins have no field type; they would be hidden fields with option ids, kept in step by hand | Columns that say what they are (`period`, `waiting_until`, `follow_ups`, `remind_at`, `folder_id`, …) |
| Queries | "What is on this day" reads JSON cells of every record of the person's databases | Indexed columns (`user_id, workspace_id, day`) |
| Habits | Repeating records (`lib/repeat-records.ts`) make one record per occurrence; streaks need their own log anyway | One row per habit with its rule as JSON, one row per check-in (`planner_habit_log`, with `on_time`) |
| Writes | Every reschedule is a record command with versions, relation sync, record previews, offline log and search triggers | One `UPDATE` in the planner's own transaction |
| ThisDay | ThisDay's ids and "done days ThisDay has seen" would be hidden fields | `source`, `external_id`, `source_done` |
| Permissions | Page roles; a shared database exposes records to members | Personal by construction: every query names the person and the workspace |
| What flowplan gives for free | Database views, CalDAV, ICS, reminders, MCP tools, search | Not yet: the planner builds these later phases (see below) |

The deciding points are the planner's own semantics (periods, waiting, follow-ups, check-ins, ThisDay bookkeeping), which are columns here and conventions there, and the cost of each change on a 1 GB server. What databases give for free (CalDAV, ICS, reminders, search, MCP) is planned for the planner in Phases 2–4; the planner's tables are shaped so each of those is a reader of plain columns.

Notes are different: a note is writing, and flowplan's editor is the best thing it has. So **a note is a flowplan document** and **a day note is a journal day**.

## Tables (schema 141)

All are personal: `user_id` is the person whose planner it is, `workspace_id` the workspace it lives in. A person has one planner per workspace (on a personal instance, one).

- **`planner_items`**: one row per task, event, habit or note (`kind`).
  - `day`, `time` are the person's local day and time (`YYYY-MM-DD`, `HH:MM`): a task's due day (or the first day of its week or month with `period` = `week`/`month`; no day with `someday`), an event's start, a habit's first day, the day a note is pinned to. Events end at `end_day`/`end_time` or are `all_day`.
  - Tasks: `priority` 0–3, `in_progress`, `waiting_until` with `follow_ups` (each new wait counts one), `duration` (minutes), `location`, `link`, `remind_at` (`YYYY-MM-DDTHH:MM`, apart from the due day), nested subtasks through `parent_id` (at most four levels), `done_at`/`done_day`.
  - Habits: `repeat` holds the rule as JSON (`lib/daybar/repeat.ts`).
  - Notes: `page_id` is the flowplan document; the planner shows the page's title and renames the page when the note is renamed. Notes imported from ThisDay or the old page are plain text (`body`, no page).
  - Organizing: `folder_id` (one), tags through `planner_item_tags`, `favorite` with `favorite_position`, `position`, and `icon`: a Lucide icon by name shown in front of the title (`lib/daybar/icons.ts` lists the names the server accepts; the browser loads their drawings when one shows, `components/daybar/icon-set.tsx`).
  - Imports: `source` (`thisday`, `legacy`) with `external_id` (unique per person and source); `source_done` keeps ThisDay's own done days as of the last import.
  - The trash: `deleted_at` (ms). Subtasks go and come back with their task; a note's page goes to flowplan's trash with it.
- **`planner_habit_log`**: a habit's check-ins, one per day; `on_time` is 0 for a day logged afterwards (streaks count on-time check-ins only).
- A note's **voice recording** lives in `planner_items.audio` (JSON `{ file, seconds, peaks }`): the file is uploaded to the note's own page (`/api/upload`, with that page's rights) and the server accepts only a file of that page; only notes keep one, and an item is created without one (the recording follows its upload).
- **`planner_folders`** (with an optional `icon` like items), **`planner_tags`** (unique per person by `lower(name)`), **`planner_item_tags`**. The `icon` and `audio` columns came after schema 141 as nullable columns an older version leaves alone, so the schema number stayed.
- **`planner_settings`**: per person and workspace, JSON: week start, default event length, working hours, the calendar's last view, the notes page, the day-note journal, and the ThisDay sync state (last export, sent outbox keys, the folder of each ThisDay category).

PostgreSQL gets the same tables from `lib/db-driver/postgres-schema.json` (regenerated with `node --import tsx scripts/db-pg-schema.mjs`). Account deletion removes the planner (`lib/account-deletion.ts`), an account merge moves it (`lib/account-merge.ts`).

## Notes and day notes

- **Notes** are documents below a page "Notes" in the person's private space (made on first use, like the page of "My tasks", `lib/personal-tasks.ts privateSpace`). They are created, renamed and trashed through flowplan's `command()`, so the editor, history, search, sharing and export work as for any page. Opening a note opens its page.
- **Day notes** are the days of a journal "Day notes" in the same private space. The Today page shows the day's items as lines and the day note's text; opening it opens the journal day (made the way the journal's day picker makes days: `journal.roll`).

## Code

| Where | What |
| --- | --- |
| `lib/daybar/model.ts` | Types and the pure questions every view asks: what a day holds, the Tasks page's groups, the right panel's scopes, the Inbox, moving to another day |
| `lib/daybar/repeat.ts` | Habit rules, due days, on-time streaks, best streak, month rate, 7-day strip |
| `lib/daybar/quick-add.ts` | The Quick Add grammar (`parseQuickAdd`) |
| `lib/daybar/store.ts` | The server: `plannerState`, `plannerCommand` (every change, validated with zod, in one transaction), notes and day notes |
| `lib/daybar/thisday.ts`, `thisday-server.ts` | ThisDay: reading the export, the merge, the outbox |
| `lib/daybar/legacy.ts` | The old single-page Daybar's JSON backup |
| `app/api/planner/[[...path]]/handler.ts` | `GET /api/planner/state`, `GET /api/planner/day-notes`, `POST /api/planner`, `GET /api/planner/thisday/…` |
| `components/daybar/` | The planner's screens inside flowplan's workspace shell |

## API

- `GET /api/planner/state?workspace=&today=`: items (done tasks of the last 120 days), check-ins of the last 800 days, folders, tags, settings.
- `POST /api/planner` with `{ action, workspaceId, today, … }`: `item.create` (with a client-made id, so the browser shows it at once), `item.update`, `items.update` (Move all), `item.done`, `item.delete`, `item.restore`, `habit.check`, `folder.*`, `tag.*`, `settings.update`, `dayNote.open`, `thisday.import`, `thisday.resend`, `legacy.import`. `today` is the browser's local day: done days, on-time check-ins and follow-ups use it.
- Browser sessions (with the origin check) and personal API tokens (`Authorization: Bearer fp_…`); read-only tokens read only.

## ThisDay

The rules of the single-page Daybar are kept (`lib/daybar/thisday.ts`):

- **Import**: Settings → Planner (or the Today page's sync card) uploads a ThisDay export (format 2). ThisDay is the truth for its own items (uppercase UUIDs): they are added, overwritten and removed (to the trash) as ThisDay says; a tick made here survives until ThisDay shows it done. An export older than the last one imported is refused. One that would remove more than 20 items and more than a third of ThisDay's items here is held until confirmed. An own item that comes back from ThisDay (twin: same title, day and kind) becomes ThisDay's item, keeping its id, page and a tick made meanwhile. ThisDay's categories become folders; steps become subtasks; habit logs become check-ins.
- **Outbox**: `GET /api/planner/thisday/to-thisday.json` serves `{ app: "Daybar", kind: "to-thisday", version: 1, createdAt, changes }`, each change with its `key` (`add:<id>` for the person's own open tasks, notes and events; `tick:<ThisDay id>:<day>` for ticks made here). Fetching it marks the changes as sent (as writing the file did); `peek=1` and read-only tokens only look. The iPhone Shortcut fetches it with "Get Contents of URL" and the header `Authorization: Bearer <a personal API token>` (Settings → API). After the next import, sent keys ThisDay now shows are forgotten.
- Items from the old page's backup are not sent from here (the page may have sent them already); the next ThisDay import finds them as twins.

## The shell

The planner's screens live inside flowplan's workspace app (`components/workspace-app.tsx`) at `#plan/<view>` addresses (`#plan/today`, `#plan/upcoming`, `#plan/calendar`, `#plan/notes`, `#plan/tasks`, `#plan/events`, `#plan/habits`, `#plan/folder/<id>`, `#plan/tag/<id>`, `#plan/favorites`). Today is the start page. The planner's sidebar part (pages, then Favorites, Folders and Tags with five items and "View all") sits above flowplan's spaces and page tree, so documents, databases and whiteboards stay one click away; flowplan's own places (home, inbox, my tasks, library) stay in the sidebar below. The right panel uses flowplan's docked side panel (`components/side-panel.tsx`).
