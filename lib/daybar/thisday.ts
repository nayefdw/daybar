// Sync with ThisDay (iOS), ported from the single-page Daybar
// (docs/daybar/legacy/daybar-v7.html: fromThisDay, mergeThisDay, outbox).
// Pure functions; lib/daybar/thisday-server.ts applies them to the planner.
//
// The rules, as before:
// - ThisDay's export (formatVersion 2) is the truth for ThisDay's own items
//   (their ids are uppercase UUIDs). They come in as items with source
//   "thisday" and ThisDay's id; an import overwrites them, removes those
//   ThisDay no longer has and adds new ones.
// - Going back, ThisDay's Shortcuts actions can only add items and tick
//   them off, so those are the changes Daybar sends (the outbox,
//   to-thisday.json). A tick made here survives an import until ThisDay
//   shows it done.
// - An item sent from Daybar comes back with ThisDay's own id: the twin is
//   found by title and day, and the item here becomes ThisDay's (a tick
//   made meanwhile is kept).
// - An export older than the last one imported is refused; one that would
//   remove many items waits until it is confirmed.
import type { ItemKind, Priority } from "./model";
import { DAILY, type RepeatRule } from "./repeat";

export type SyncStep = { title: string; done: boolean };
// One ThisDay item as the planner reads it.
export type SyncItem = {
  externalId: string;
  kind: ItemKind;
  title: string;
  body: string;
  day: string | null;
  time: string | null;
  duration: number | null;
  someday: boolean;
  priority: Priority;
  steps: SyncStep[];
  remindAt: string | null;
  link: string | null;
  location: string;
  // Days ThisDay shows it done: a task's completion day, a habit's check-ins.
  doneDays: string[];
  repeat: RepeatRule | null;
  categoryId: string | null;
  createdAt: number;
};
export type SyncCategory = { id: string; name: string; color: string; position: number };
export type ThisDayExport = { items: SyncItem[]; categories: SyncCategory[]; exportedAt: string; formatVersion: number };

export const TD_ID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
export const MAX_SYNC_ITEMS = 5000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const pad = (n: number) => String(n).padStart(2, "0");

// Days are instants at local midnight: +12 h lands inside the local day
// for any UTC offset.
export const tdDay = (v: unknown) => {
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t + 432e5).toISOString().slice(0, 10) : null;
};
// An instant as [YYYY-MM-DD, HH:MM] in the item's own time zone (unknown
// zones: UTC, the server has no device zone).
export function tdLocal(v: unknown, tz: string): [string | null, string | null] {
  const t = Date.parse(String(v));
  if (!Number.isFinite(t)) return [null, null];
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`];
  } catch {
    const d = new Date(t);
    return [d.toISOString().slice(0, 10), `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`];
  }
}
export const isThisDayExport = (d: unknown): d is Record<string, unknown> =>
  !!d && typeof d === "object" && !Array.isArray(d) && Array.isArray((d as { tasks?: unknown }).tasks) && Array.isArray((d as { habits?: unknown }).habits);

const PRIORITY: Record<string, Priority> = { none: 0, low: 1, medium: 2, high: 3 };
const TD_COLOR: Record<string, string> = { graphite: "gray", grey: "gray", indigo: "purple", mint: "teal", cyan: "teal", lime: "green" };
const COLORS = new Set(["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown"]);
export const folderColor = (c: unknown) => {
  const name = String(c || "").toLowerCase();
  const mapped = TD_COLOR[name] || name;
  return COLORS.has(mapped) ? mapped : "gray";
};
const minutes = (v: unknown) => (Number.isFinite(v) && Number(v) > 0 && Number(v) <= 1440 ? Math.round(Number(v)) : null);
const httpLink = (v: unknown) => {
  if (typeof v !== "string" || v.length > 2000) return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

// ThisDay's export → the planner's view of it. `today` stands in for a
// completion day ThisDay did not record.
export function fromThisDay(d: Record<string, unknown>, today: string): ThisDayExport {
  const list = (a: unknown) => (Array.isArray(a) ? a : []) as Record<string, unknown>[];
  const zone = typeof d.timeZone === "string" ? d.timeZone : "";
  // Items name their category, categories carry the id.
  const catIds = new Map<string, string>();
  for (const c of list(d.categories)) if (c && typeof c.id === "string") [catIds.set(String(c.name), c.id), catIds.set(c.id, c.id)];
  const category = (v: unknown) => (typeof v === "string" ? catIds.get(v) ?? null : null);
  const item = (t: Record<string, unknown>, fallback: ItemKind): SyncItem | null => {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || !t.id || t.id.length > 120) return null;
    const tz = typeof t.timeZone === "string" ? t.timeZone : zone;
    const k = String(t.kind ?? "");
    const kind: ItemKind = k === "event" ? "event" : ["note", "voice", "moment"].includes(k) ? "note" : ["task", "location", "place"].includes(k) ? "task" : fallback;
    // Inbox and Someday items have no day.
    const day = !t.list || t.list === "day" ? tdDay(t.day) : null;
    const transcript = typeof t.transcript === "string" ? t.transcript : "";
    const title = str(t.title, 300).trim() || transcript.trim().split("\n")[0].slice(0, 300) || str(t.text, 300).trim().split("\n")[0];
    if (!title) return null;
    const [remindDay, remindTime] = t.reminderAt ? tdLocal(t.reminderAt, tz) : [null, null];
    return {
      externalId: t.id,
      kind,
      title,
      body: [t.notes ?? t.text, transcript !== t.title ? transcript : ""].filter((x): x is string => typeof x === "string" && !!x).join("\n\n").slice(0, 20_000),
      day,
      time: kind === "note" ? null : t.scheduledAt ? tdLocal(t.scheduledAt, tz)[1] : null,
      duration: minutes(t.durationMinutes),
      someday: t.list === "someday",
      priority: PRIORITY[String(t.priority)] ?? 0,
      steps: list(t.steps)
        .filter((s) => s && typeof s.title === "string" && s.title.trim())
        .slice(0, 100)
        .map((s) => ({ title: String(s.title).trim().slice(0, 300), done: !!s.isCompleted })),
      remindAt: remindDay && remindTime ? `${remindDay}T${remindTime}` : null,
      link: httpLink(t.link),
      location: str(t.address || t.location, 300),
      doneDays: t.isCompleted ? [(t.completedAt ? tdLocal(t.completedAt, tz)[0] : null) || day || today] : [],
      repeat: null,
      categoryId: category(t.category),
      createdAt: Date.parse(String(t.createdAt)) || 0,
    };
  };
  const logs = new Map<string, string[]>();
  for (const l of list(d.habitLogs)) {
    const day = l && Number(l.value) > 0 ? tdDay(l.day) : null;
    if (day && typeof l.habitID === "string") logs.set(l.habitID, [...(logs.get(l.habitID) || []), day]);
  }
  const habit = (x: Record<string, unknown>): SyncItem | null => {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || !x.id) return null;
    const title = str(x.title, 300).trim();
    if (!title) return null;
    const tz = typeof x.timeZone === "string" ? x.timeZone : zone;
    const doneDays = [...new Set(logs.get(x.id) || [])].sort();
    // ThisDay counts Sunday as 1.
    const days = Array.isArray(x.weekdays) ? [...new Set(x.weekdays.filter((w): w is number => Number.isInteger(w) && w >= 1 && w <= 7).map((w) => w - 1))].sort((a, b) => a - b) : [];
    // Check-ins can predate the habit.
    const first = [tdLocal(x.createdAt, tz)[0], doneDays[0]].filter((v): v is string => isDate(v)).sort()[0] || today;
    return {
      externalId: x.id,
      kind: "habit",
      title,
      body: "",
      day: first,
      time: x.preferredTime ? tdLocal(x.preferredTime, tz)[1] : null,
      duration: null,
      someday: false,
      priority: 0,
      steps: [],
      remindAt: null,
      link: null,
      location: "",
      doneDays,
      repeat: days.length && days.length < 7 ? { ...DAILY, unit: "week", weekdays: days } : DAILY,
      categoryId: category(x.category),
      createdAt: Date.parse(String(x.createdAt)) || 0,
    };
  };
  const moment = (m: Record<string, unknown>): SyncItem | null => {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id) return null;
    const n = Number(m.photoCount) | 0,
      text = typeof m.text === "string" ? m.text.trim() : "";
    return {
      externalId: m.id,
      kind: "note",
      title: text.split("\n")[0].slice(0, 300) || (n ? `${n} photo${n > 1 ? "s" : ""} in ThisDay` : "Moment"),
      body: text.slice(0, 20_000),
      day: tdDay(m.day),
      time: null,
      duration: null,
      someday: false,
      priority: 0,
      steps: [],
      remindAt: null,
      link: null,
      location: "",
      doneDays: [],
      repeat: null,
      categoryId: null,
      createdAt: Date.parse(String(m.createdAt)) || 0,
    };
  };
  const items = [
    ...list(d.tasks).map((t) => item(t, "task")),
    ...list(d.notes).map((t) => item(t, "note")),
    ...list(d.voiceCaptures).map((t) => item(t, "note")),
    ...list(d.habits).map(habit),
    ...list(d.moments).map(moment),
  ].filter((x): x is SyncItem => !!x);
  // One item per id: a repeated id keeps its first appearance.
  const seen = new Set<string>();
  const unique = items.filter((x) => !seen.has(x.externalId) && !!seen.add(x.externalId)).slice(0, MAX_SYNC_ITEMS);
  const categories = list(d.categories)
    .filter((c) => c && typeof c.id === "string" && typeof c.name === "string" && c.name.trim())
    .sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0))
    .slice(0, 50)
    .map((c, i) => ({ id: String(c.id), name: String(c.name).trim().slice(0, 80), color: folderColor(c.color), position: i + 1 }));
  return {
    items: unique,
    categories,
    exportedAt: typeof d.exportedAt === "string" ? d.exportedAt.slice(0, 40) : "",
    formatVersion: Number(d.formatVersion) || 0,
  };
}

// ---- The merge ----

// What the planner holds, for the merge: ThisDay's items (by ThisDay's id,
// with ThisDay's own done days as of the last import) and the person's own
// sendable items (for the twins).
export type HeldItem = {
  id: string;
  kind: ItemKind;
  title: string;
  day: string | null;
  // ThisDay's id when the item is ThisDay's.
  externalId: string | null;
  doneDays: string[];
  // ThisDay's done days at the last import (null: not ThisDay's).
  sourceDone: string[] | null;
  // Imported from the old Daybar page: twinned, but never sent.
  legacy?: boolean;
  // In the trash here (ThisDay's items come back with an import).
  deleted?: boolean;
};
export type MergePlan = {
  // ThisDay's items new here, or back after being removed.
  add: { item: SyncItem; doneDays: string[] }[];
  // ThisDay's items already here: their fields from ThisDay, done days
  // ThisDay's plus ticks made here ThisDay has not seen.
  update: { id: string; item: SyncItem; doneDays: string[] }[];
  // An own item that came back from ThisDay: it becomes ThisDay's.
  adopt: { id: string; item: SyncItem; doneDays: string[] }[];
  // ThisDay's items ThisDay no longer has.
  remove: string[];
};
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const repeats = (kind: ItemKind) => kind === "habit";
export const SENDABLE: readonly ItemKind[] = ["task", "note", "event"];

// Days ticked here that ThisDay has not shown done yet.
export function pendingTicks(item: Pick<HeldItem, "kind" | "doneDays" | "sourceDone" | "externalId">): string[] {
  if (!item.externalId || !item.sourceDone) return [];
  const base = item.sourceDone;
  if (repeats(item.kind)) return item.doneDays.filter((d) => !base.includes(d));
  return item.doneDays.length && !base.length ? [item.doneDays[0]] : [];
}

export function mergeThisDay(held: readonly HeldItem[], incoming: readonly SyncItem[]): MergePlan {
  const byExternal = new Map(held.filter((h) => h.externalId && h.sourceDone).map((h) => [h.externalId!, h]));
  const incomingIds = new Set(incoming.map((t) => t.externalId));
  const plan: MergePlan = { add: [], update: [], adopt: [], remove: [] };
  for (const h of byExternal.values()) if (!incomingIds.has(h.externalId!) && !h.deleted) plan.remove.push(h.id);
  const fresh: SyncItem[] = [];
  for (const t of incoming) {
    const h = byExternal.get(t.externalId);
    if (!h) {
      fresh.push(t);
      continue;
    }
    // A tick made here survives until ThisDay has it.
    const base = h.sourceDone || [];
    const local = repeats(t.kind) ? h.doneDays.filter((x) => !base.includes(x)) : h.doneDays.length && !base.length && !t.doneDays.length ? h.doneDays : [];
    plan.update.push({ id: h.id, item: t, doneDays: [...new Set([...t.doneDays, ...local])].sort() });
  }
  // Twins: an own item sent to ThisDay that came back with ThisDay's id.
  const own = held.filter((h) => !h.sourceDone && !h.deleted && SENDABLE.includes(h.kind));
  const taken = new Set<string>();
  for (const t of fresh) {
    const twin = own.find((h) => !taken.has(h.id) && sameTitle(h.title, t.title) && h.day === t.day && h.kind === t.kind);
    if (!twin) {
      plan.add.push({ item: t, doneDays: t.doneDays });
      continue;
    }
    taken.add(twin.id);
    plan.adopt.push({ id: twin.id, item: t, doneDays: twin.doneDays.length && !t.doneDays.length ? twin.doneDays : t.doneDays });
  }
  return plan;
}

// More than 20 removals and more than a third of ThisDay's items here: an
// export from a device that has not caught up would empty the planner.
export const holdsTooMany = (removed: number, held: number) => removed > 20 && removed > held / 3;

// ---- The outbox ----

export type OutboxItem = HeldItem & { time: string | null; notes: string; open: boolean; topLevel: boolean };
export type Change = { key: string; action: "add" | "tick"; type: ItemKind; title: string; date: string | null; time?: string | null; when: string; notes?: string; sent: boolean };
export function outbox(items: readonly OutboxItem[], sent: readonly string[]): Change[] {
  const out: Omit<Change, "sent">[] = [];
  for (const it of items) {
    if (!it.topLevel) continue;
    if (!it.sourceDone) {
      if (!it.legacy && SENDABLE.includes(it.kind) && it.open)
        out.push({ key: `add:${it.id}`, action: "add", type: it.kind, title: it.title, date: it.day, time: it.time, when: [it.day, it.time].filter(Boolean).join(" "), notes: it.notes });
    } else for (const d of pendingTicks(it)) out.push({ key: `tick:${it.externalId}:${d}`, action: "tick", type: it.kind, title: it.title, date: d, when: d });
  }
  return out.map((c) => ({ ...c, sent: sent.includes(c.key) }));
}
// The document the iPhone Shortcut reads.
export const sendDoc = (changes: readonly Change[], createdAt = new Date().toISOString()) => ({
  app: "Daybar",
  kind: "to-thisday",
  version: 1,
  createdAt,
  changes: changes.map(({ sent: _sent, ...c }) => c),
});
