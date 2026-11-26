# Daybar on flowplan: the Woday feature map

Sources: Woday's site and screenshots, and all 146 guides in its help center (read 26 Nov 2026), set against flowplan's code (`main`, AGPL-3.0). Daybar keeps its own name and look. Nothing from Woday is copied: no name, mascot, text, icons or images.

**How to read the right-hand column**

| Mark | Meaning |
| --- | --- |
| ✅ | flowplan already does it; Daybar uses it as is |
| 🔧 | flowplan has the base; Daybar reshapes it the Woday way |
| 🆕 | Daybar builds it |
| ⛔ | Mac or Apple only; the web equivalent is noted |
| ✔ | done in `daybar-work/` |

## 1. Main window

**Sidebar**
- Pages: Today, Upcoming, Calendar, Notes, Tasks, Events, Habits, Folders, Tags, Views.
- Favorites and Files rows.
- Sections (Favorites, Notes, Tasks, Events, Views, Folders, Tags), each showing 5 items and "View all (N)".
- A ⋯ menu with Analytics, Settings, Trash and Feedback.
- Resizable and collapsible.

flowplan: 🔧 (sidebar with spaces and a page tree).

**Top bar**
- Sidebar toggle, back and forward, sync ring.
- "Search, or create anything…" (⌘K), New, Inbox, AI, and a side panel toggle.

flowplan: 🔧 (its search palette).

**Right panel**
- A title menu switches scope:
  - Inbox, All, Upcoming, Overdue, Waiting
  - Today, Calendar
  - Tasks, Events, Notes, Files
  - one folder or one tag
- It has its own quick-add line and filters.
- Items open here, in full view or as an overlay (a setting).

flowplan: 🔧 (side panel, record dock).

## 2. Today

- A day strip that also works as a drop target.
- A summary such as "Good morning, you have 3 events and 2 tasks", plus weather.
- A "This week" card.
- A day note: one editable page that shows the day's tasks, events and notes as lines inside free text.
  - A to-do typed there becomes a task due that day.
  - An event line becomes an event at 9:00.
- A leftovers card ("From yesterday you still have…") with "Move to today" or "Move all".
- An evening "Still on your plate" card, two hours before the day ends.
- An "Auto-move unfinished tasks" setting and a done-today ring.

flowplan: 🔧 (journal with one page per day that carries open tasks forward, plus agenda, task and habit widgets).

## 3. Upcoming

- The next 30 days.
- Board layout: one column per day; drag a card to another day to reschedule it, keeping its time; long days collapse behind "Show more".
- List layout.

Daybar: 🆕

## 4. Calendar

**Views**
- Day; Days (2, 3, 4 or 5 columns); Week; Month.
- The last view is remembered; there's also a default-view setting.

**Grid**
- An all-day band.
- A "This week" strip in Week view and a "This month" strip in Month view, for whole-period tasks.
- Working hours, with the grid stretching for items outside them.
- Weekend tint.
- A filter funnel for events, tasks, tags, folders, completed items, habits and synced calendars.

**Editing**
- Click a slot to make a 1-hour event; drag in a column to make one for the dragged span.
- Drag to move and drag the edges to resize, both in 15-minute steps.
- Drop items from the Inbox onto a slot or day.
- Delete removes the selected item; ⌘Z undoes.

flowplan: 🔧 for month view (database calendar); 🆕 for the time grid.

## 5. Tasks

**Fields**
- When: a day, optionally with a time; a whole week; a whole month; or Someday.
- Priority: None, Low, Medium or High; the checkbox takes the priority's color.
- In progress.
- Waiting until (presets or custom), with a countdown badge and a "Follow-up #n" badge when it returns.
- Duration: 15 minutes to 4 hours.
- Location, with a map.
- A reminder separate from the due date, with presets.
- Nested subtasks, with a done/total badge and a progress ring in the checkbox.

**Actions**
- Cover, favorite, tags, folder.
- Convert to a note or event, or copy as one.
- Duplicate.
- History log (a setting).
- Trash and restore.
- Completion sound with 5 choices.

**Tasks page**
- Default grouping: Inbox, Overdue, each day, weeks and months, Waiting, Someday, Done.
- Layouts: List, Board and Table.
- Group by, sort by, Show, tags, folders and sources.
- Filter pills.
- Tabs for saved views.

**Analytics page**
- Monthly tiles compared with last month: created, completed, events, notes, time scheduled, average booked per day, free on workdays, done on time.
- Daily activity and highlights.

flowplan: 🔧 (document tasks, task databases with status, due date, priority, subtasks, reminders and repeats, and a "My tasks" list and board).

## 6. Habits

**Repeat editor**
- Every N days, weeks, months or years (1–99).
- Weekday buttons with Weekdays and Weekends shortcuts.
- Monthly on a day or yearly on a date, with short months falling on their last day.
- Ends never, on a date, or after N completions.
- A reminder at a time.

**Streaks and history**
- Streaks count on-time completions only.
- Best streak, monthly rate and a 7-day history strip.
- Back-logging by picking a past day.

**Habits page**
- Counts such as "3 due today · 1 done today".
- Grouping by date, folder or tag.

flowplan: 🔧 (repeating records, a habits widget, journal trackers).

## 7. Events

**Creating**
- ⇧⌘N.
- From the grid.
- From the Events page.
- In a note.
- By converting a task or note.

**Editing**
- One schedule badge opens a start and end picker: a calendar with a time list, an all-day switch, and typed input.
- A + menu adds a location, a calendar, a reminder, a meeting link, a folder, a tag, a linked task or a linked note.

**Synced events**
- Read-only, with a join card for Zoom, Meet, Teams and others.
- Guests and RSVP.
- Your own notes and to-dos under them.

**Events page**
- List, Board and Table layouts.
- Group by date, folder or tag.
- Show upcoming, past or all.

flowplan: 🔧 (CalDAV two-way ✅, ICS feeds ✅, meetings module).

## 8. Notes

**Editing basics**
- Block editor with a slash menu and Markdown shortcuts.
- Every block type: text, heading, lists, to-do, quote, divider, code (15 languages), table, image, video, link card, file and view.
- Six-dot handle to move and convert blocks, and multi-select.
- Inline formatting.

flowplan: ✅ (TipTap editor with all of this and more).

**Task, event and note blocks**
- A to-do line is a real task.
- An event line is a real event.
- A note line creates a linked note.
- Inside these lines, `@` sets the date, plus `!`, `~`, `$` and `#`.

flowplan: 🔧 (document tasks with due dates).

**@-mentions, #tags and dated notes**
- `@` mentions a task, event or note.
- `#` adds a tag.
- Notes can be pinned to a day.

flowplan: 🔧

**Magic Lines**
- The calculator, units, currency and date arithmetic: flowplan has "=" with Tab ✅.
- AI answers at the end of a line, presets, sections, totals and suggestion chips: 🆕.

**Export, icons and covers**
- Export to Markdown, PDF or RTF, and print.
- Icon picker (icons, emoji, upload) and covers.

flowplan: ✅

## 9. Quick Add

**Grammar**
- Kind prefixes and kind words.
- Command sentences.
- Automatic kind.
- Days, times, "tonight".
- Weeks, months, Someday.
- Repeat phrases.
- `#`, `$`, `!`, `!!`, `!!!` and `~`.
- Links saved as tasks.
- German, French and Spanish words.

Status: ✔ `lib/daybar/quick-add.ts`, 20 passing tests.

**Input UI**
- Kind badge with colors.
- Colored highlights.
- A Create row with a day timeline preview.
- Symbol menus for `#`, `@`, `!`, `~`, `*`, `$` and `/`.

Status: 🆕

## 10. Organizing

- Folders (one per item) and tags (many per item).
- Favorites with reordering.
- The Inbox: items with no date and no folder.
- Filters, grouping, sorting and pills.
- Saved views: global, folder, tag and page views, 11 templates, tabs, and live view blocks inside notes.
- Drag and drop onto every target listed in the docs.

flowplan: 🔧 (spaces, tags, collections or saved searches, linked views).

**Files**
- File items.
- A Files page filtered by type, size and location.
- A reading list.

flowplan: 🔧 (media library).

**Trash**

flowplan: ✅

## 11. Search and commands

**⌘K**
- Result groups: Create, Views, Folders, Tags, Commands, Notes, Tasks, Events.
- Tab opens actions; `>` shows commands only.
- An Ask mode for questions.

flowplan: 🔧

**Launcher**
- In the page: 🆕.
- System-wide shortcut: through the Daybar desktop app.

**Not available on the web**
- Menu bar panel and widgets: ⛔ (the desktop app's tray is possible).
- Save for Later: flowplan's web clipper ✅.

## 12. AI assistant and MCP

**Chat panel**
- Context chips, file attachments, starter suggestions, saved chats, model picker with Auto.

**Planner tools**
- Woday lists 37 tools: agenda, free time, tasks, habits, notes, search, tags, folders, views, trash, stats, memory.

**Approvals**
- Apply, Always allow, Dismiss.
- Preview for larger note edits.

**Agent mode**
- Morning briefing.
- Meeting heads-up.
- Evening wind-down.
- Weekly review.

**Other AI pieces**
- Writing tools and quick answers.

flowplan: 🔧 (AI with Ollama, OpenAI, Anthropic or Gemini; writing tools; Ask; an MCP server). The planner tools, approvals and agent mode are 🆕.

## 13. Integrations

| Service | flowplan / Daybar |
| --- | --- |
| ThisDay (export and Shortcut outbox) | ✅ carried over from Daybar; on a server the iPhone Shortcut can talk to Daybar directly |
| CalDAV (iCloud and others) and ICS feeds | ✅ |
| Notion and Obsidian import | ✅ |
| Google Calendar two-way | 🆕 (OAuth) |
| Todoist, TickTick, Linear | 🆕 (API tokens) |
| Weather on Today | 🆕 (Open-Meteo, no key) |
| Apple Calendar, Reminders, Notes, Apple Intelligence | ⛔; iCloud calendars work through CalDAV |

## 14. Import, export and data

- Import center: CSV or XLSX with column mapping, Markdown, text and PDF. flowplan: 🔧
- Export everything as an 18-column CSV. Daybar: 🆕
- Sample content and reset. flowplan: 🔧

## 15. Settings and appearance

**General**
- Open at launch, default calendar view, week start, time format.
- Working hours.
- Open items in the side panel, full view or overlay.
- Auto-move, task history, completion sound, weather.

**Notifications**
- Task reminders, due times, waiting tasks, events (with lead time), daily briefing.

**Appearance**
- Themes, 10 primary colors, text size, fonts, weekend tint.
- Sidebar arrangement.

**Shortcuts**
- Customizable.

flowplan: 🔧 (themes, fonts, notification preferences, web push, keymap).

## 16. Phone and iPad

**Phone**
- A tab bar with Today, Calendar, Notes, Tasks and Events.
- A menu sheet.
- Swipe to complete or delete.
- Long-press menus.

**iPad**
- A two-column layout with the Inbox.

flowplan: 🔧 (responsive installable web app, offline, push).

## 17. Sync

- iCloud: ⛔
- On Daybar's server, every device sees the same data. flowplan: ✅

---

## Build order

1. **Planner core**
   - The data model: tasks, events, habits, folders, tags and day notes on flowplan's storage.
   - The window: sidebar, top bar and right panel.
   - Pages: Today, Upcoming, Calendar (day, days, week, month), Tasks (list, board, table) and Habits.
   - Item details, Quick Add input, ⌘K.
   - ThisDay sync, and moving your current Daybar data across.
2. **Organizing and settings**
   - Views and filters, favorites, files, Trash.
   - Events page, Analytics.
   - Settings, appearance and notifications.
3. **AI**
   - Assistant chat with the planner tools, approvals and agent mode.
   - Magic Lines.
   - Planner tools in MCP.
4. **Integrations and polish**
   - Google Calendar, Todoist, TickTick and Linear.
   - Weather, import center and CSV export.
   - Phone layout polish, desktop app with launcher and tray.
