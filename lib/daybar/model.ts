// Daybar's planner model, shared by the server (lib/daybar/store.ts) and the
// browser (components/daybar): the item, folder, tag and settings shapes,
// day arithmetic on YYYY-MM-DD strings, and the questions every view asks
// ("what is on this day", "what is overdue", "which group is this task
// in"). Pure functions, no database, no DOM.
import { addDays, weekStart, weekdayOf } from "./quick-add";
import type { RepeatRule } from "./repeat";

export { addDays, weekStart, weekdayOf };
export type ItemKind = "task" | "event" | "habit" | "note";
export const ITEM_KINDS: readonly ItemKind[] = ["task", "event", "habit", "note"];
export type Period = "week" | "month" | "someday";
export type Priority = 0 | 1 | 2 | 3;
export type ItemSource = "" | "thisday" | "legacy";

export type PlannerItem = {
  id: string;
  kind: ItemKind;
  title: string;
  // Plain text under a task, event or habit (a note's text is its page).
  body: string;
  // A note's flowplan document; null for notes imported as plain text.
  pageId: string | null;
  // The task a subtask belongs to.
  parentId: string | null;
  // The person's local day and time: a task's due day (or the first day of
  // its week or month), an event's start, a habit's first day, a note's day.
  day: string | null;
  time: string | null;
  endDay: string | null;
  endTime: string | null;
  allDay: boolean;
  period: Period | null;
  // Minutes (tasks).
  duration: number | null;
  priority: Priority;
  inProgress: boolean;
  // Waiting until this day; followUps counts how often the task waited.
  waitingUntil: string | null;
  followUps: number;
  location: string;
  link: string | null;
  // YYYY-MM-DDTHH:MM, separate from the due day.
  remindAt: string | null;
  // Habits.
  repeat: RepeatRule | null;
  folderId: string | null;
  // Tag ids.
  tags: string[];
  favorite: boolean;
  favoritePosition: number | null;
  doneAt: number | null;
  doneDay: string | null;
  position: number;
  source: ItemSource;
  externalId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

// A habit's check-in; onTime is false for a day logged afterwards.
export type HabitLog = { itemId: string; day: string; onTime: boolean };
export type Folder = { id: string; name: string; color: string; position: number };
export type Tag = { id: string; name: string; color: string; position: number };
export type CalendarView = "day" | "days" | "week" | "month";
export type PlannerSettings = {
  // 1 = Monday, 0 = Sunday.
  weekStart: 0 | 1;
  // Default length of a new event, minutes.
  eventMinutes: number;
  // Working hours of the calendar grid (hours, 0–24).
  workStart: number;
  workEnd: number;
  calendarView: CalendarView;
  // Columns of the Days view (2–5).
  calendarDays: number;
  // The page that holds the notes, and the journal of the day notes.
  notesPageId: string | null;
  journalId: string | null;
  // ThisDay sync: the newest export imported, the outbox keys already
  // sent, when the last import ran, and the folder of each ThisDay category.
  thisday: { lastExport: string | null; sent: string[]; lastImport: number | null; folders: Record<string, string> };
};
export const DEFAULT_SETTINGS: PlannerSettings = {
  weekStart: 1,
  eventMinutes: 60,
  workStart: 8,
  workEnd: 18,
  calendarView: "week",
  calendarDays: 3,
  notesPageId: null,
  journalId: null,
  thisday: { lastExport: null, sent: [], lastImport: null, folders: {} },
};
export type PlannerState = {
  items: PlannerItem[];
  logs: HabitLog[];
  folders: Folder[];
  tags: Tag[];
  settings: PlannerSettings;
};

// A new item with nothing set (the browser makes the id of what it creates,
// so it can show it at once).
export function blankItem(kind: ItemKind, at = Date.now()): PlannerItem {
  return {
    id: globalThis.crypto.randomUUID(),
    kind,
    title: "",
    body: "",
    pageId: null,
    parentId: null,
    day: null,
    time: null,
    endDay: null,
    endTime: null,
    allDay: false,
    period: null,
    duration: null,
    priority: 0,
    inProgress: false,
    waitingUntil: null,
    followUps: 0,
    location: "",
    link: null,
    remindAt: null,
    repeat: null,
    folderId: null,
    tags: [],
    favorite: false,
    favoritePosition: null,
    doneAt: null,
    doneDay: null,
    position: at,
    source: "",
    externalId: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

// ---- Days ----

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
const pad = (n: number) => String(n).padStart(2, "0");
// The local day of a Date (the browser's time zone).
export const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
export const daysInMonth = (day: string) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
export function addMonths(day: string, n: number) {
  const y = Number(day.slice(0, 4)),
    m = Number(day.slice(5, 7)) - 1 + n,
    d = Number(day.slice(8, 10));
  const first = new Date(Date.UTC(y, m, 1));
  const key = first.toISOString().slice(0, 10);
  return `${key.slice(0, 8)}${pad(Math.min(d, daysInMonth(key)))}`;
}
export const diffDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
// The ISO week number of a day.
export function isoWeek(day: string) {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

// ---- Items ----

export const isOpen = (item: PlannerItem) => !item.deletedAt && !item.doneAt;
export const isTopTask = (item: PlannerItem) => item.kind === "task" && !item.parentId;
// A task waiting until a later day.
export const isWaiting = (item: PlannerItem, today: string) => !!item.waitingUntil && item.waitingUntil > today;
// Waited and back: shows its follow-up badge.
export const isFollowUp = (item: PlannerItem, today: string) => !!item.waitingUntil && item.waitingUntil <= today && item.followUps > 0;
// The day a task counts for: its own, or the day it came back from waiting.
export function taskDay(item: PlannerItem): string | null {
  if (item.period) return null;
  if (item.waitingUntil && (!item.day || item.waitingUntil > item.day)) return item.waitingUntil;
  return item.day;
}
// Open, dated before today, not waiting: overdue.
export const isOverdue = (item: PlannerItem, today: string) => {
  const day = taskDay(item);
  return item.kind === "task" && isOpen(item) && !isWaiting(item, today) && !!day && day < today;
};
// The Inbox: open tasks and notes with no date and no folder.
export const inInbox = (item: PlannerItem) =>
  !item.deletedAt && !item.parentId && (item.kind === "task" || item.kind === "note") && !item.doneAt && !item.day && !item.period && !item.folderId && !item.waitingUntil;
// An event on a day (multi-day events on each of their days).
export function eventOnDay(item: PlannerItem, day: string) {
  if (item.kind !== "event" || item.deletedAt || !item.day) return false;
  const end = item.endDay && item.endDay >= item.day ? item.endDay : item.day;
  // An event ending at midnight does not reach into its end day.
  if (end > item.day && day === end && !item.allDay && item.endTime === "00:00") return false;
  return day >= item.day && day <= end;
}
// A task due on a day (not a period, not a subtask).
export const taskOnDay = (item: PlannerItem, day: string, today: string) =>
  item.kind === "task" && !item.deletedAt && !item.parentId && !isWaiting(item, today) && taskDay(item) === day;
// A task planned for the week or month that contains the day.
export function taskInPeriod(item: PlannerItem, day: string, weekStartsOn: 0 | 1) {
  if (item.kind !== "task" || item.deletedAt || item.parentId || !item.period || item.period === "someday" || !item.day) return false;
  if (item.period === "week") return weekStart(day, weekStartsOn) === weekStart(item.day, weekStartsOn);
  return monthStart(day) === monthStart(item.day);
}
export const noteOnDay = (item: PlannerItem, day: string) => item.kind === "note" && !item.deletedAt && item.day === day;
// Sorts by time (untimed first for tasks, all-day first for events), then
// priority, then position.
export function byTime(a: PlannerItem, b: PlannerItem) {
  const ta = a.allDay ? "" : a.time || "",
    tb = b.allDay ? "" : b.time || "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.position - b.position || a.createdAt - b.createdAt;
}

// What a day holds: its events, tasks (open and done), notes and habits due.
export type DayItems = { events: PlannerItem[]; tasks: PlannerItem[]; notes: PlannerItem[]; habits: PlannerItem[] };
export function itemsOnDay(items: readonly PlannerItem[], day: string, today: string, habitDue: (habit: PlannerItem, day: string) => boolean): DayItems {
  const out: DayItems = { events: [], tasks: [], notes: [], habits: [] };
  for (const item of items) {
    if (item.deletedAt) continue;
    if (eventOnDay(item, day)) out.events.push(item);
    else if (taskOnDay(item, day, today)) out.tasks.push(item);
    else if (noteOnDay(item, day)) out.notes.push(item);
    else if (item.kind === "habit" && habitDue(item, day)) out.habits.push(item);
  }
  out.events.sort(byTime);
  out.tasks.sort(byTime);
  out.habits.sort(byTime);
  return out;
}

// Subtasks of a task, and how many are done.
export function subtasksOf(items: readonly PlannerItem[], parentId: string) {
  return items.filter((i) => i.parentId === parentId && !i.deletedAt).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}
export function subtaskProgress(items: readonly PlannerItem[], parentId: string) {
  const list = subtasksOf(items, parentId);
  return { done: list.filter((i) => i.doneAt).length, total: list.length };
}

// ---- The Tasks page's default groups ----

export type TaskGroupKey = "inbox" | "overdue" | "waiting" | "someday" | "done" | `day:${string}` | `week:${string}` | `month:${string}`;
export type TaskGroup = { key: TaskGroupKey; kind: "inbox" | "overdue" | "day" | "week" | "month" | "waiting" | "someday" | "done"; start: string | null; items: PlannerItem[] };
const GROUP_ORDER = { inbox: 0, overdue: 1, day: 2, week: 3, month: 4, waiting: 5, someday: 6, done: 7 } as const;
// One group per task: Inbox (no date, no folder), Overdue, each day,
// weeks and months, Waiting, Someday, Done. Days, weeks and months in
// order; within a group by time, priority and position.
export function taskGroupKey(item: PlannerItem, today: string): TaskGroupKey {
  if (item.doneAt) return "done";
  if (isWaiting(item, today)) return "waiting";
  if (item.period === "someday") return "someday";
  if (item.period === "week" && item.day) return `week:${item.day}`;
  if (item.period === "month" && item.day) return `month:${item.day}`;
  const day = taskDay(item);
  if (day) return day < today ? "overdue" : `day:${day}`;
  // Undated, in a folder: under "No date" – the Inbox is undated and unfiled.
  return item.folderId ? "someday" : "inbox";
}
export function taskGroups(items: readonly PlannerItem[], today: string, options: { doneSince?: string } = {}): TaskGroup[] {
  const groups = new Map<TaskGroupKey, TaskGroup>();
  for (const item of items) {
    if (item.kind !== "task" || item.parentId || item.deletedAt) continue;
    if (item.doneAt && options.doneSince && (item.doneDay || "") < options.doneSince) continue;
    const key = taskGroupKey(item, today);
    const [kind, start] = key.includes(":") ? (key.split(":") as [TaskGroup["kind"], string]) : [key as TaskGroup["kind"], null];
    if (!groups.has(key)) groups.set(key, { key, kind, start, items: [] });
    groups.get(key)!.items.push(item);
  }
  for (const group of groups.values())
    group.items.sort(group.kind === "done" ? (a, b) => (b.doneAt || 0) - (a.doneAt || 0) : group.kind === "overdue" ? (a, b) => (taskDay(a) || "").localeCompare(taskDay(b) || "") || byTime(a, b) : byTime);
  return [...groups.values()].sort((a, b) => GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind] || (a.start || "").localeCompare(b.start || ""));
}

// ---- Upcoming ----

// The next `days` days from today: per day its events, tasks and notes.
export function upcomingDays(items: readonly PlannerItem[], today: string, days = 30) {
  return daysBetween(today, addDays(today, days - 1)).map((day) => {
    const on = itemsOnDay(items, day, today, () => false);
    return { day, items: [...on.events, ...on.tasks.filter((t) => !t.doneAt || t.doneDay === today), ...on.notes] };
  });
}

// Moving an item to another day keeps its time (and an event its length).
export function movedToDay(item: PlannerItem, day: string): Partial<PlannerItem> {
  if (item.kind === "event" && item.day) {
    const span = item.endDay ? diffDays(item.day, item.endDay) : 0;
    return { day, endDay: item.endDay ? addDays(day, span) : null };
  }
  if (item.kind === "task") return { day, period: null, waitingUntil: item.waitingUntil && item.waitingUntil <= day ? item.waitingUntil : null };
  return { day };
}

// The right panel's scopes.
export type PanelScope = "inbox" | "all" | "upcoming" | "overdue" | "waiting" | "today" | "calendar";
export function scopeItems(items: readonly PlannerItem[], scope: PanelScope, today: string): PlannerItem[] {
  const top = items.filter((i) => !i.deletedAt && !i.parentId && i.kind !== "habit");
  switch (scope) {
    case "inbox":
      return top.filter(inInbox);
    case "all":
      return top.filter((i) => !i.doneAt).sort((a, b) => b.createdAt - a.createdAt);
    case "upcoming":
      return top
        .filter((i) => !i.doneAt && ((i.kind === "event" && i.day && i.day > today) || (i.kind === "task" && (taskDay(i) || "") > today && !isWaiting(i, today))))
        .sort((a, b) => ((a.kind === "task" ? taskDay(a) : a.day) || "").localeCompare((b.kind === "task" ? taskDay(b) : b.day) || "") || byTime(a, b));
    case "overdue":
      return top.filter((i) => isOverdue(i, today)).sort((a, b) => (taskDay(a) || "").localeCompare(taskDay(b) || ""));
    case "waiting":
      return top.filter((i) => i.kind === "task" && !i.doneAt && isWaiting(i, today)).sort((a, b) => (a.waitingUntil || "").localeCompare(b.waitingUntil || ""));
    case "today": {
      const on = itemsOnDay(top, today, today, () => false);
      return [...on.events, ...on.tasks, ...on.notes];
    }
    case "calendar":
      // What can be dropped onto the calendar: open undated tasks.
      return top.filter((i) => i.kind === "task" && !i.doneAt && !i.day && !i.period && !isWaiting(i, today)).sort((a, b) => b.createdAt - a.createdAt);
  }
}
