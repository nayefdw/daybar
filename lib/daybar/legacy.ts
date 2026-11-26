// The single-page Daybar's own JSON export ("daybar-backup-<day>.json",
// docs/daybar/legacy/daybar-v7.html exportBackup) brought into the planner,
// so its items move over. Its categories become folders. ThisDay's items in
// it (uppercase ids) arrive as ThisDay's, with ThisDay's done days of the
// page's last sync, so the sync carries on where the page left it; the
// page's own items are remembered by their id, so importing the same file
// again updates them instead of adding them twice. Own items are not sent
// to ThisDay from here (the page may have sent them already; the next
// ThisDay import finds those as twins).
import { all, id, one, run } from "../db";
import { HttpError } from "../auth";
import { DAILY, type RepeatRule } from "./repeat";
import { addDays, isDay, isTime, minutesOf, timeOf, weekdayOf, type ItemKind, type PlannerItem } from "./model";
import { blankItem, normalized, writeItem, type PlannerCtx } from "./store";
import { TD_ID, folderColor } from "./thisday";

export const MAX_LEGACY_ITEMS = 5000;
const TYPES = ["task", "event", "note", "voice", "place", "moment", "habit"] as const;
type LegacyType = (typeof TYPES)[number];
const REPEATS = ["daily", "weekdays", "weekly", "monthly", "yearly"] as const;
type LegacyRepeat = (typeof REPEATS)[number];
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,120}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const dayList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((d): d is string => isDay(d)))].sort().slice(-2000) : []);

export type LegacyItem = {
  id: string;
  type: LegacyType;
  title: string;
  notes: string;
  date: string | null;
  time: string | null;
  duration: number | null;
  repeat: LegacyRepeat | "none";
  doneOn: string[];
  days: number[];
  created: number;
  category: string | null;
  priority: "none" | "low" | "medium" | "high";
  checklist: { t: string; d: boolean }[];
  remind: string | null;
  link: string | null;
  address: string;
  tdDone: string[] | null;
};
export type LegacyBackup = { items: LegacyItem[]; categories: { id: string; name: string; color: string }[] };

// The page's normalize(): stored data is untrusted, only well-formed
// fields stay.
export function legacyItem(v: unknown): LegacyItem | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const type = r.type === "photo" || r.type === "video" ? "moment" : r.type;
  if (typeof r.title !== "string" || !TYPES.includes(type as LegacyType) || typeof r.id !== "string" || !ID_RE.test(r.id) || r.id === "settings") return null;
  const title = r.title.trim().slice(0, 300);
  if (!title) return null;
  const time = isTime(r.time) ? r.time : null;
  let duration = Number.isFinite(r.duration) && Number(r.duration) > 0 && Number(r.duration) <= 1440 ? Math.round(Number(r.duration)) : null;
  // The first version stored an end time.
  if (!duration && time && isTime(r.end) && r.end > time) duration = minutesOf(r.end) - minutesOf(time);
  const link = typeof r.link === "string" && /^https:\/\/[^\s<>"'`]+$/i.test(r.link) && r.link.length <= 500 ? r.link : null;
  return {
    id: r.id,
    type: type as LegacyType,
    title,
    notes: str(r.notes, 20_000),
    date: isDay(r.date) ? r.date : null,
    time,
    duration,
    repeat: REPEATS.includes(r.repeat as LegacyRepeat) ? (r.repeat as LegacyRepeat) : "none",
    doneOn: dayList(r.doneOn),
    days: Array.isArray(r.days) ? [...new Set(r.days.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b) : [],
    created: Number(r.created) || 0,
    category: typeof r.category === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.category) ? r.category : null,
    priority: r.priority === "low" || r.priority === "medium" || r.priority === "high" ? r.priority : "none",
    checklist: Array.isArray(r.checklist)
      ? r.checklist
          .filter((c): c is { t: string; d?: unknown } => !!c && typeof (c as { t?: unknown }).t === "string" && !!(c as { t: string }).t.trim())
          .slice(0, 100)
          .map((c) => ({ t: c.t.trim().slice(0, 300), d: !!c.d }))
      : [],
    remind: isTime(r.remind) ? r.remind : null,
    link,
    address: str(r.address, 300),
    tdDone: Array.isArray(r.tdDone) ? dayList(r.tdDone) : null,
  };
}
export function readLegacyBackup(raw: unknown): LegacyBackup {
  const d = raw as Record<string, unknown> | unknown[];
  const rows = Array.isArray(d) ? d : Array.isArray(d?.items) ? (d.items as unknown[]) : null;
  if (!rows) throw new HttpError(400, "Das ist keine Sicherung des alten Daybar.");
  const items = rows.slice(0, MAX_LEGACY_ITEMS).map(legacyItem).filter((x): x is LegacyItem => !!x);
  const categories = (!Array.isArray(d) && Array.isArray(d.categories) ? (d.categories as Record<string, unknown>[]) : [])
    .filter((c) => c && typeof c.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(c.id) && typeof c.name === "string" && c.name.trim())
    .slice(0, 50)
    .map((c) => ({ id: String(c.id), name: String(c.name).trim().slice(0, 80), color: folderColor(c.color) }));
  return { items, categories };
}

const PRIORITY = { none: 0, low: 1, medium: 2, high: 3 } as const;
// The page's repeat as a habit rule.
export function legacyRule(item: Pick<LegacyItem, "repeat" | "days" | "date">): RepeatRule {
  switch (item.repeat) {
    case "weekdays":
      return { ...DAILY, unit: "week", weekdays: [1, 2, 3, 4, 5] };
    case "weekly":
      return { ...DAILY, unit: "week", weekdays: item.days.length ? item.days : item.date ? [weekdayOf(item.date)] : [] };
    case "monthly":
      return { ...DAILY, unit: "month", monthDay: item.date ? Number(item.date.slice(8, 10)) : null };
    case "yearly":
      return { ...DAILY, unit: "year" };
    default:
      return DAILY;
  }
}
// What a page item is in the planner: a repeating item is a habit; voice
// notes and moments are notes; a place is a task with its address.
export function legacyKind(item: Pick<LegacyItem, "type" | "repeat">): ItemKind {
  if (item.type === "habit" || item.repeat !== "none") return "habit";
  if (item.type === "event") return "event";
  if (item.type === "note" || item.type === "voice" || item.type === "moment") return "note";
  return "task";
}
export function legacyPlannerItem(item: LegacyItem, folderId: string | null, today: string): Omit<PlannerItem, "id"> & { logs: string[] } {
  const kind = legacyKind(item);
  const base = blankItem(kind, item.created || Date.now());
  const end = kind === "event" && item.time && item.duration ? minutesOf(item.time) + item.duration : null;
  return {
    ...base,
    title: item.title,
    body: item.notes,
    day: item.date ?? (kind === "habit" ? today : null),
    time: item.time,
    endDay: end !== null && item.date ? addDays(item.date, Math.floor(end / 1440)) : null,
    endTime: end !== null ? timeOf(end % 1440) : null,
    allDay: kind === "event" && !item.time,
    duration: kind === "task" ? item.duration : null,
    priority: kind === "task" ? PRIORITY[item.priority] : 0,
    location: item.address,
    link: item.link,
    remindAt: item.remind && item.date && kind !== "note" ? `${item.date}T${item.remind}` : null,
    repeat: kind === "habit" ? legacyRule(item) : null,
    folderId,
    doneAt: kind !== "habit" && item.doneOn.length ? Date.parse(`${item.doneOn[0]}T12:00:00Z`) || Date.now() : null,
    doneDay: kind !== "habit" && item.doneOn.length ? item.doneOn[0] : null,
    logs: kind === "habit" ? item.doneOn : [],
  };
}

export async function importLegacyBackup(ctx: PlannerCtx, raw: unknown) {
  const backup = readLegacyBackup(raw);
  if (!backup.items.length) throw new HttpError(400, "Die Sicherung enthält keine Einträge.");
  // Categories as folders, by name.
  const folders = new Map<string, string>();
  for (const c of backup.categories) {
    let folderId = (await one<{ id: string }>("SELECT id FROM planner_folders WHERE user_id=? AND workspace_id=? AND lower(name)=lower(?)", ctx.user.id, ctx.workspaceId, c.name))?.id;
    if (!folderId) {
      folderId = id();
      const count = (await one<{ n: number }>("SELECT COUNT(*) n FROM planner_folders WHERE user_id=? AND workspace_id=?", ctx.user.id, ctx.workspaceId))?.n ?? 0;
      await run("INSERT INTO planner_folders(id,workspace_id,user_id,name,color,position,created_at) VALUES(?,?,?,?,?,?,?)", folderId, ctx.workspaceId, ctx.user.id, c.name, c.color, count + 1, Date.now());
    }
    folders.set(c.id, folderId);
  }
  let added = 0,
    updated = 0;
  for (const item of backup.items) {
    const fromThisDay = TD_ID.test(item.id);
    const source = fromThisDay ? "thisday" : "legacy";
    const existing = await one<{ id: string; created_at: number; position: number; favorite: number }>(
      "SELECT id,created_at,position,favorite FROM planner_items WHERE user_id=? AND workspace_id=? AND source=? AND external_id=?",
      ctx.user.id,
      ctx.workspaceId,
      source,
      item.id,
    );
    const { logs, ...fields } = legacyPlannerItem(item, item.category ? folders.get(item.category) ?? null : null, ctx.today);
    const planned = normalized({ ...fields, id: existing?.id ?? id(), source, externalId: item.id, position: existing?.position ?? fields.position, favorite: !!existing?.favorite }, ctx.today, ctx.settings);
    // ThisDay's own done days as of the page's last sync.
    const sourceDone = fromThisDay ? JSON.stringify(item.tdDone ?? item.doneOn) : null;
    if (existing) {
      await writeItem(ctx, { ...planned, createdAt: existing.created_at, updatedAt: Date.now() }, true);
      await run("UPDATE planner_items SET deleted_at=NULL,source_done=COALESCE(?,source_done) WHERE id=? AND user_id=?", sourceDone, existing.id, ctx.user.id);
      updated++;
    } else {
      await writeItem(ctx, planned, false, { source, externalId: item.id, sourceDone });
      added++;
    }
    for (const day of logs) await run("INSERT INTO planner_habit_log(item_id,day,done_at,on_time) VALUES(?,?,?,1) ON CONFLICT(item_id,day) DO NOTHING", planned.id, day, Date.now());
    // The checklist as subtasks, by position.
    const steps = planned.kind === "task" ? item.checklist : [];
    const children = await all<{ id: string; external_id: string | null }>("SELECT id,external_id FROM planner_items WHERE parent_id=? AND user_id=?", planned.id, ctx.user.id);
    for (const [i, step] of steps.entries()) {
      const key = `${item.id}#${i}`;
      const child = children.find((c) => c.external_id === key);
      const done = step.d ? Date.now() : null;
      if (child) await run("UPDATE planner_items SET title=?,done_at=?,done_day=?,deleted_at=NULL WHERE id=?", step.t, done, done ? ctx.today : null, child.id);
      else
        await writeItem(ctx, { ...blankItem("task"), title: step.t, parentId: planned.id, position: i, doneAt: done, doneDay: done ? ctx.today : null }, false, {
          source,
          externalId: key,
          sourceDone: fromThisDay ? "[]" : null,
        });
    }
  }
  return { added, updated, folders: folders.size };
}
