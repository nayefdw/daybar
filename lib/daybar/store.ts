// Daybar's planner on the server: the person's items, check-ins, folders,
// tags and settings in a workspace (lib/db.ts schema 141,
// docs/daybar/architecture.md). Everything is personal: every query names
// the person and the workspace, so nobody reads or changes another
// person's planner, and membership of the workspace is checked first
// (lib/permissions.ts). Notes are flowplan documents in the person's
// private space, made and trashed through command() like any page; day
// notes are the days of a journal there.
import { z } from "zod";
import { all, id, lockFor, one, run, transaction } from "../db";
import { HttpError } from "../auth";
import { requireMember, pageRole } from "../permissions";
import { ct } from "../content-locale";
import type { Identity, Page } from "../types";
import {
  DEFAULT_SETTINGS,
  blankItem,
  addDays,
  isDay,
  minutesOf,
  monthStart,
  timeOf,
  weekStart,
  type Folder,
  type HabitLog,
  type ItemKind,
  type PlannerItem,
  type PlannerSettings,
  type PlannerState,
  type Tag,
} from "./model";
import { DAILY, repeatRuleSchema, type RepeatRule } from "./repeat";

const api = import("../api");
export { blankItem };
export const MAX_ITEMS = 20_000;
const MAX_FOLDERS = 200;
const MAX_TAGS = 500;
// Done tasks older than this stay out of the state the planner loads.
export const DONE_DAYS = 120;
export const LOG_DAYS = 800;

type Row = {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: ItemKind;
  title: string;
  body: string;
  page_id: string | null;
  parent_id: string | null;
  day: string | null;
  time: string | null;
  end_day: string | null;
  end_time: string | null;
  all_day: number;
  period: PlannerItem["period"];
  duration: number | null;
  priority: number;
  in_progress: number;
  waiting_until: string | null;
  follow_ups: number;
  location: string;
  link: string | null;
  remind_at: string | null;
  repeat: string | null;
  folder_id: string | null;
  favorite: number;
  favorite_position: number | null;
  done_at: number | null;
  done_day: string | null;
  position: number;
  source: PlannerItem["source"];
  external_id: string | null;
  source_done: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  page_title?: string | null;
};

function parseRule(text: string | null): RepeatRule | null {
  if (!text) return null;
  try {
    const parsed = repeatRuleSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : DAILY;
  } catch {
    return DAILY;
  }
}
export function itemOf(row: Row, tags: string[] = []): PlannerItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.kind === "note" && row.page_title != null ? row.page_title : row.title,
    body: row.body,
    pageId: row.page_id,
    parentId: row.parent_id,
    day: row.day,
    time: row.time,
    endDay: row.end_day,
    endTime: row.end_time,
    allDay: !!row.all_day,
    period: row.period,
    duration: row.duration,
    priority: Math.max(0, Math.min(3, Number(row.priority) || 0)) as PlannerItem["priority"],
    inProgress: !!row.in_progress,
    waitingUntil: row.waiting_until,
    followUps: Number(row.follow_ups) || 0,
    location: row.location,
    link: row.link,
    remindAt: row.remind_at,
    repeat: row.kind === "habit" ? parseRule(row.repeat) ?? DAILY : null,
    folderId: row.folder_id,
    tags,
    favorite: !!row.favorite,
    favoritePosition: row.favorite_position,
    doneAt: row.done_at,
    doneDay: row.done_day,
    position: Number(row.position) || 0,
    source: row.source,
    externalId: row.external_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at,
  };
}

// ---- Settings ----

const settingsPatch = z
  .object({
    weekStart: z.union([z.literal(0), z.literal(1)]),
    eventMinutes: z.number().int().min(5).max(24 * 60),
    workStart: z.number().int().min(0).max(23),
    workEnd: z.number().int().min(1).max(24),
    calendarView: z.enum(["day", "days", "week", "month"]),
    calendarDays: z.number().int().min(2).max(5),
  })
  .partial()
  .strict();
export async function plannerSettings(userId: string, workspaceId: string): Promise<PlannerSettings> {
  const row = await one<{ data: string }>("SELECT data FROM planner_settings WHERE user_id=? AND workspace_id=?", userId, workspaceId);
  let data: Partial<PlannerSettings> = {};
  try {
    data = row ? (JSON.parse(row.data) as Partial<PlannerSettings>) : {};
  } catch {}
  const merged = { ...DEFAULT_SETTINGS, ...settingsPatch.safeParse(pick(data, Object.keys(settingsPatch.shape))).data };
  return {
    ...merged,
    notesPageId: typeof data.notesPageId === "string" ? data.notesPageId : null,
    journalId: typeof data.journalId === "string" ? data.journalId : null,
    thisday: {
      lastExport: typeof data.thisday?.lastExport === "string" ? data.thisday.lastExport.slice(0, 40) : null,
      sent: Array.isArray(data.thisday?.sent) ? data.thisday.sent.filter((k): k is string => typeof k === "string" && k.length <= 200).slice(-2000) : [],
      lastImport: typeof data.thisday?.lastImport === "number" ? data.thisday.lastImport : null,
      folders: Object.fromEntries(
        Object.entries(data.thisday?.folders && typeof data.thisday.folders === "object" ? data.thisday.folders : {})
          .filter(([k, v]) => k.length <= 120 && typeof v === "string" && /^[0-9a-f-]{36}$/.test(v))
          .slice(0, 100),
      ),
    },
  };
}
const pick = (o: object, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
export async function saveSettings(userId: string, workspaceId: string, settings: PlannerSettings) {
  const data = JSON.stringify(settings);
  await run(
    "INSERT INTO planner_settings(user_id,workspace_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,workspace_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    userId,
    workspaceId,
    data,
    Date.now(),
  );
}

// ---- Reading ----

async function tagsOf(userId: string, workspaceId: string) {
  const map = new Map<string, string[]>();
  for (const l of await all<{ item_id: string; tag_id: string }>(
    "SELECT l.item_id,l.tag_id FROM planner_item_tags l JOIN planner_tags t ON t.id=l.tag_id WHERE t.user_id=? AND t.workspace_id=? ORDER BY t.position,l.tag_id",
    userId,
    workspaceId,
  ))
    map.set(l.item_id, [...(map.get(l.item_id) || []), l.tag_id]);
  return map;
}
const ITEM_SELECT = "SELECT i.*,p.title AS page_title FROM planner_items i LEFT JOIN pages p ON p.id=i.page_id";
// A note whose page went to the trash is hidden with it.
const VISIBLE = "i.deleted_at IS NULL AND (i.page_id IS NULL OR p.deleted_at IS NULL)";

export async function plannerState(user: Identity, workspaceId: string, today: string | null = null, now = Date.now()): Promise<PlannerState> {
  await requireMember(user, workspaceId);
  const doneSince = now - DONE_DAYS * 86_400_000;
  const rows = await all<Row>(
    `${ITEM_SELECT} WHERE i.user_id=? AND i.workspace_id=? AND ${VISIBLE} AND (i.done_at IS NULL OR i.done_at>=? OR i.kind<>'task') ORDER BY i.position,i.created_at LIMIT ?`,
    user.id,
    workspaceId,
    doneSince,
    MAX_ITEMS,
  );
  const tags = await tagsOf(user.id, workspaceId);
  const since = addDays(today && isDay(today) ? today : new Date(now).toISOString().slice(0, 10), -LOG_DAYS);
  const logs = await all<{ item_id: string; day: string; on_time: number }>(
    "SELECT l.item_id,l.day,l.on_time FROM planner_habit_log l JOIN planner_items i ON i.id=l.item_id WHERE i.user_id=? AND i.workspace_id=? AND i.deleted_at IS NULL AND l.day>=? ORDER BY l.day",
    user.id,
    workspaceId,
    since,
  );
  return {
    items: rows.map((r) => itemOf(r, tags.get(r.id) || [])),
    logs: logs.map((l): HabitLog => ({ itemId: l.item_id, day: l.day, onTime: !!l.on_time })),
    folders: await listFolders(user.id, workspaceId),
    tags: await listTags(user.id, workspaceId),
    settings: await plannerSettings(user.id, workspaceId),
  };
}
async function listFolders(userId: string, workspaceId: string): Promise<Folder[]> {
  return await all<Folder>("SELECT id,name,color,position FROM planner_folders WHERE user_id=? AND workspace_id=? ORDER BY position,created_at", userId, workspaceId);
}
async function listTags(userId: string, workspaceId: string): Promise<Tag[]> {
  return await all<Tag>("SELECT id,name,color,position FROM planner_tags WHERE user_id=? AND workspace_id=? ORDER BY position,created_at", userId, workspaceId);
}
// One of the person's own items in the workspace, or 404.
async function ownItem(user: Identity, workspaceId: string, itemId: string): Promise<Row> {
  const row = await one<Row>(`${ITEM_SELECT} WHERE i.id=? AND i.user_id=? AND i.workspace_id=?`, itemId, user.id, workspaceId);
  if (!row) throw new HttpError(404, "Eintrag nicht gefunden.");
  return row;
}
export async function readItem(user: Identity, workspaceId: string, itemId: string) {
  const row = await ownItem(user, workspaceId, itemId);
  return itemOf(row, (await tagsOf(user.id, workspaceId)).get(row.id) || []);
}

// ---- Validation ----

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Ungültige ID.").transform((v) => v.toLowerCase());
const dayText = z.string().refine(isDay, "Ungültiges Datum.");
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ungültige Uhrzeit.");
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Ungültiger Link.");
const tagName = z.string().trim().min(1).max(60);
const color = z.enum(["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown"]);
export const itemFields = z
  .object({
    kind: z.enum(["task", "event", "habit", "note"]),
    title: z.string().trim().max(300),
    body: z.string().max(20_000),
    parentId: uuid.nullable(),
    day: dayText.nullable(),
    time: timeText.nullable(),
    endDay: dayText.nullable(),
    endTime: timeText.nullable(),
    allDay: z.boolean(),
    period: z.enum(["week", "month", "someday"]).nullable(),
    duration: z.number().int().min(1).max(24 * 60).nullable(),
    priority: z.number().int().min(0).max(3),
    inProgress: z.boolean(),
    waitingUntil: dayText.nullable(),
    location: z.string().trim().max(300),
    link: httpUrl.nullable(),
    remindAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Ungültige Erinnerung.")
      .refine((v) => isDay(v.slice(0, 10)), "Ungültige Erinnerung.")
      .nullable(),
    repeat: repeatRuleSchema.nullable(),
    folderId: uuid.nullable(),
    tags: z.array(tagName).max(30),
    favorite: z.boolean(),
    position: z.number().finite(),
  })
  .partial()
  .strict();
export type ItemInput = z.infer<typeof itemFields>;

// What a kind does with the fields (as Quick Add does, lib/daybar/quick-add.ts):
// a task's period clears its day or sets the period's first day; an event
// has a day, is all-day without a time and ends after it starts; a habit has
// a rule and a first day; a note keeps only its day.
export function normalized(item: PlannerItem, today: string, settings: Pick<PlannerSettings, "weekStart" | "eventMinutes">): PlannerItem {
  const out = { ...item };
  if (out.kind !== "task") [out.period, out.waitingUntil, out.inProgress, out.parentId] = [null, null, false, null];
  if (out.kind !== "event") [out.endDay, out.endTime, out.allDay] = [null, null, false];
  if (out.kind !== "habit") out.repeat = null;
  if (out.kind === "note") [out.time, out.duration, out.priority, out.remindAt] = [null, null, 0, null];
  if (out.kind === "task") {
    if (out.period === "someday") [out.day, out.time] = [null, null];
    else if (out.period === "week") [out.day, out.time] = [weekStart(out.day || today, settings.weekStart), null];
    else if (out.period === "month") [out.day, out.time] = [monthStart(out.day || today), null];
    if (!out.day) out.time = null;
  }
  if (out.kind === "event") {
    out.day ||= today;
    out.priority = 0;
    out.duration = null;
    if (!out.time) out.allDay = true;
    if (out.allDay) {
      [out.time, out.endTime] = [null, null];
      if (!out.endDay || out.endDay < out.day) out.endDay = null;
    } else {
      const start = minutesOf(out.time!);
      let endDay = out.endDay && out.endDay >= out.day ? out.endDay : out.day;
      let end = out.endTime;
      if (!end || (endDay === out.day && minutesOf(end) <= start)) {
        const total = start + settings.eventMinutes;
        endDay = addDays(out.day, Math.floor(total / 1440));
        end = timeOf(total % 1440);
      }
      [out.endDay, out.endTime] = [endDay, end];
    }
  }
  if (out.kind === "habit") {
    out.repeat ||= DAILY;
    out.day ||= today;
  }
  return out;
}

// ---- Writing ----

type Ctx = { user: Identity; workspaceId: string; today: string; settings: PlannerSettings };
const now = () => Date.now();

export async function tagIdsFor(ctx: Ctx, names: string[]) {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/^#/, "").trim().slice(0, 60);
    if (!name) continue;
    let tag = await one<{ id: string }>("SELECT id FROM planner_tags WHERE user_id=? AND workspace_id=? AND lower(name)=lower(?)", ctx.user.id, ctx.workspaceId, name);
    if (!tag) {
      const count = (await one<{ n: number }>("SELECT COUNT(*) n FROM planner_tags WHERE user_id=? AND workspace_id=?", ctx.user.id, ctx.workspaceId))?.n ?? 0;
      if (count >= MAX_TAGS) throw new HttpError(400, "Höchstens 500 Tags.");
      tag = { id: id() };
      await run(
        "INSERT INTO planner_tags(id,workspace_id,user_id,name,color,position,created_at) VALUES(?,?,?,?,?,?,?)",
        tag.id,
        ctx.workspaceId,
        ctx.user.id,
        name,
        TAG_COLORS[count % TAG_COLORS.length],
        count + 1,
        now(),
      );
    }
    if (!ids.includes(tag.id)) ids.push(tag.id);
  }
  return ids;
}
const TAG_COLORS = ["blue", "green", "orange", "purple", "teal", "pink", "red", "yellow"] as const;
export async function setTags(itemId: string, tagIds: string[]) {
  await run("DELETE FROM planner_item_tags WHERE item_id=?", itemId);
  for (const tagId of tagIds) await run("INSERT INTO planner_item_tags(item_id,tag_id) VALUES(?,?) ON CONFLICT DO NOTHING", itemId, tagId);
}
async function checkFolder(ctx: Ctx, folderId: string | null | undefined) {
  if (!folderId) return;
  if (!(await one("SELECT 1 FROM planner_folders WHERE id=? AND user_id=? AND workspace_id=?", folderId, ctx.user.id, ctx.workspaceId)))
    throw new HttpError(404, "Ordner nicht gefunden.");
}
// A subtask's task: the person's own task, at most four levels deep, never
// the item itself or below it.
async function checkParent(ctx: Ctx, itemId: string, parentId: string | null | undefined) {
  if (!parentId) return;
  let current: string | null = parentId;
  for (let depth = 0; current; depth++) {
    if (current === itemId) throw new HttpError(400, "Eine Aufgabe kann nicht unter sich selbst liegen.");
    if (depth >= 4) throw new HttpError(400, "Höchstens vier Ebenen Unteraufgaben.");
    const row: { parent_id: string | null; kind: string } | undefined = await one<{ parent_id: string | null; kind: string }>(
      "SELECT parent_id,kind FROM planner_items WHERE id=? AND user_id=? AND workspace_id=? AND deleted_at IS NULL",
      current,
      ctx.user.id,
      ctx.workspaceId,
    );
    if (!row || row.kind !== "task") throw new HttpError(404, "Übergeordnete Aufgabe nicht gefunden.");
    current = row.parent_id;
  }
}

const COLUMNS: [keyof PlannerItem, string, (v: unknown) => unknown][] = [
  ["kind", "kind", (v) => v],
  ["title", "title", (v) => v],
  ["body", "body", (v) => v],
  ["pageId", "page_id", (v) => v],
  ["parentId", "parent_id", (v) => v],
  ["day", "day", (v) => v],
  ["time", "time", (v) => v],
  ["endDay", "end_day", (v) => v],
  ["endTime", "end_time", (v) => v],
  ["allDay", "all_day", (v) => (v ? 1 : 0)],
  ["period", "period", (v) => v],
  ["duration", "duration", (v) => v],
  ["priority", "priority", (v) => v],
  ["inProgress", "in_progress", (v) => (v ? 1 : 0)],
  ["waitingUntil", "waiting_until", (v) => v],
  ["followUps", "follow_ups", (v) => v],
  ["location", "location", (v) => v],
  ["link", "link", (v) => v],
  ["remindAt", "remind_at", (v) => v],
  ["repeat", "repeat", (v) => (v ? JSON.stringify(v) : null)],
  ["folderId", "folder_id", (v) => v],
  ["favorite", "favorite", (v) => (v ? 1 : 0)],
  ["favoritePosition", "favorite_position", (v) => v],
  ["doneAt", "done_at", (v) => v],
  ["doneDay", "done_day", (v) => v],
  ["position", "position", (v) => v],
];
export async function writeItem(ctx: Ctx, item: PlannerItem, existing: boolean, extra: { source?: string; externalId?: string | null; sourceDone?: string | null } = {}) {
  if (existing) {
    const sets = COLUMNS.map(([, column]) => `${column}=?`).join(",");
    await run(
      `UPDATE planner_items SET ${sets},updated_at=? WHERE id=? AND user_id=? AND workspace_id=?`,
      ...COLUMNS.map(([key, , to]) => to(item[key]) as never),
      item.updatedAt,
      item.id,
      ctx.user.id,
      ctx.workspaceId,
    );
    return;
  }
  const columns = ["id", "workspace_id", "user_id", ...COLUMNS.map(([, c]) => c), "source", "external_id", "source_done", "created_at", "updated_at"];
  await run(
    `INSERT INTO planner_items(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    item.id,
    ctx.workspaceId,
    ctx.user.id,
    ...COLUMNS.map(([key, , to]) => to(item[key]) as never),
    extra.source ?? item.source,
    extra.externalId ?? item.externalId,
    extra.sourceDone ?? null,
    item.createdAt,
    item.updatedAt,
  );
}

// The fields of an input put onto an item (tags resolved by name).
async function applyInput(ctx: Ctx, item: PlannerItem, input: ItemInput) {
  const out: PlannerItem = { ...item };
  for (const [key, value] of Object.entries(input) as [keyof ItemInput, unknown][]) {
    if (key === "tags" || value === undefined) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  if (input.tags) out.tags = await tagIdsFor(ctx, input.tags);
  if (input.waitingUntil && input.waitingUntil !== item.waitingUntil && input.waitingUntil > ctx.today) out.followUps = item.followUps + 1;
  if (input.favorite === true && !item.favorite) out.favoritePosition = Date.now();
  if (input.favorite === false) out.favoritePosition = null;
  return out;
}

export async function createItem(ctx: Ctx, input: ItemInput & { id?: string }, extra: Parameters<typeof writeItem>[3] = {}) {
  const kind = input.kind ?? "task";
  if (!input.title?.trim() && kind !== "note") throw new HttpError(400, "Bitte einen Titel angeben.");
  const count = (await one<{ n: number }>("SELECT COUNT(*) n FROM planner_items WHERE user_id=? AND workspace_id=?", ctx.user.id, ctx.workspaceId))?.n ?? 0;
  if (count >= MAX_ITEMS) throw new HttpError(400, "Höchstens 20.000 Einträge im Planer.");
  const base = blankItem(kind);
  if (input.id) {
    if (await one("SELECT 1 FROM planner_items WHERE id=?", input.id)) throw new HttpError(409, "Diesen Eintrag gibt es schon.");
    base.id = input.id;
  }
  await checkFolder(ctx, input.folderId);
  if (input.parentId && kind !== "task") throw new HttpError(400, "Nur Aufgaben haben Unteraufgaben.");
  await checkParent(ctx, base.id, input.parentId);
  const item = normalized(await applyInput(ctx, base, { ...input, kind }), ctx.today, ctx.settings);
  // A subtask follows its siblings.
  if (item.parentId && input.position === undefined) {
    const last = await one<{ p: number | null }>("SELECT MAX(position) p FROM planner_items WHERE parent_id=?", item.parentId);
    item.position = Math.max(Date.now(), Number(last?.p ?? 0) + 1);
  }
  await writeItem(ctx, item, false, extra);
  await setTags(item.id, item.tags);
  return item;
}

export async function updateItem(ctx: Ctx, itemId: string, input: ItemInput, options: { allowNote?: boolean } = {}) {
  const row = await ownItem(ctx.user, ctx.workspaceId, itemId);
  if (row.deleted_at) throw new HttpError(409, "Dieser Eintrag liegt im Papierkorb.");
  const current = itemOf(row, (await tagsOf(ctx.user.id, ctx.workspaceId)).get(row.id) || []);
  if (input.kind && input.kind !== current.kind && (input.kind === "note" || current.kind === "note") && !options.allowNote)
    throw new HttpError(400, "Notizen lassen sich nicht umwandeln.");
  if (input.kind && input.kind !== "task" && current.parentId) throw new HttpError(400, "Unteraufgaben bleiben Aufgaben.");
  await checkFolder(ctx, input.folderId);
  if (input.parentId !== undefined) await checkParent(ctx, current.id, input.parentId);
  const item = normalized(await applyInput(ctx, current, input), ctx.today, ctx.settings);
  item.updatedAt = Date.now();
  await writeItem(ctx, item, true);
  if (input.tags) await setTags(item.id, item.tags);
  // A note's title is its page's: renamed there too.
  if (current.kind === "note" && current.pageId && input.title !== undefined && input.title.trim() && input.title !== current.title)
    await (await api).command(ctx.user, { action: "page.update", pageId: current.pageId, patch: { title: input.title.trim() } }, true);
  return item;
}

// Done or not: a task (or subtask) for the day it was ticked.
export async function setDone(ctx: Ctx, itemId: string, done: boolean) {
  const row = await ownItem(ctx.user, ctx.workspaceId, itemId);
  if (row.kind !== "task") throw new HttpError(400, "Nur Aufgaben werden erledigt; Gewohnheiten werden abgehakt.");
  const at = Date.now();
  await run(
    "UPDATE planner_items SET done_at=?,done_day=?,in_progress=CASE WHEN ? IS NULL THEN in_progress ELSE 0 END,updated_at=? WHERE id=? AND user_id=?",
    done ? at : null,
    done ? ctx.today : null,
    done ? at : null,
    at,
    itemId,
    ctx.user.id,
  );
  return await readItem(ctx.user, ctx.workspaceId, itemId);
}

// A habit's check-in for a day: on time when made on that day.
export async function checkIn(ctx: Ctx, itemId: string, day: string, done: boolean) {
  const row = await ownItem(ctx.user, ctx.workspaceId, itemId);
  if (row.kind !== "habit") throw new HttpError(400, "Nur Gewohnheiten werden abgehakt.");
  if (day > ctx.today) throw new HttpError(400, "Ein künftiger Tag lässt sich noch nicht abhaken.");
  if (done)
    await run(
      "INSERT INTO planner_habit_log(item_id,day,done_at,on_time) VALUES(?,?,?,?) ON CONFLICT(item_id,day) DO NOTHING",
      itemId,
      day,
      Date.now(),
      day >= ctx.today ? 1 : 0,
    );
  else await run("DELETE FROM planner_habit_log WHERE item_id=? AND day=?", itemId, day);
  await run("UPDATE planner_items SET updated_at=? WHERE id=?", Date.now(), itemId);
  return { itemId, day, done, onTime: day >= ctx.today };
}

// Into the trash, with its subtasks; a note's page goes to flowplan's trash.
export async function deleteItem(ctx: Ctx, itemId: string) {
  const row = await ownItem(ctx.user, ctx.workspaceId, itemId);
  const at = Date.now();
  const ids = await descendants(ctx, itemId);
  for (const target of [itemId, ...ids]) await run("UPDATE planner_items SET deleted_at=?,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL", at, at, target, ctx.user.id);
  if (row.kind === "note" && row.page_id && (await one("SELECT 1 FROM pages WHERE id=? AND deleted_at IS NULL", row.page_id)))
    await (await api).command(ctx.user, { action: "page.delete", pageId: row.page_id }, true);
  return { ids: [itemId, ...ids], deletedAt: at };
}
export async function restoreItem(ctx: Ctx, itemId: string) {
  const row = await ownItem(ctx.user, ctx.workspaceId, itemId);
  if (!row.deleted_at) return await readItem(ctx.user, ctx.workspaceId, itemId);
  for (const target of [itemId, ...(await descendants(ctx, itemId))])
    await run("UPDATE planner_items SET deleted_at=NULL,updated_at=? WHERE id=? AND user_id=? AND deleted_at=?", Date.now(), target, ctx.user.id, row.deleted_at);
  if (row.kind === "note" && row.page_id && (await one("SELECT 1 FROM pages WHERE id=? AND deleted_at IS NOT NULL", row.page_id)))
    await (await api).command(ctx.user, { action: "page.restore", pageId: row.page_id, workspaceId: ctx.workspaceId }, true);
  return await readItem(ctx.user, ctx.workspaceId, itemId);
}
export async function descendants(ctx: Ctx, itemId: string) {
  const out: string[] = [];
  let level = [itemId];
  for (let depth = 0; level.length && depth < 6; depth++) {
    const next: string[] = [];
    for (const parent of level)
      for (const r of await all<{ id: string }>("SELECT id FROM planner_items WHERE parent_id=? AND user_id=? AND workspace_id=?", parent, ctx.user.id, ctx.workspaceId)) next.push(r.id);
    out.push(...next);
    level = next;
  }
  return out;
}

// ---- Notes and day notes ----

// The person's private space, the page "Notizen" there that holds the
// notes, and the journal "Tagesnotizen": made on first use, remembered in
// the settings, made again when deleted or no longer writable.
async function writablePage(user: Identity, pageId: string | null, workspaceId: string, kind: Page["kind"]) {
  if (!pageId) return null;
  const page = await one<Page>("SELECT * FROM pages WHERE id=? AND deleted_at IS NULL", pageId);
  if (!page || page.workspace_id !== workspaceId || page.kind !== kind) return null;
  const role = await pageRole(user, page);
  return role === "editor" || role === "owner" ? page : null;
}
async function createPrivatePage(ctx: Ctx, title: string, kind: "document" | "journal", parentId?: string) {
  const { privateSpace } = await import("../personal-tasks");
  const space = parentId ? (await one<{ space_id: string }>("SELECT space_id FROM pages WHERE id=?", parentId))!.space_id : (await privateSpace(ctx.user, ctx.workspaceId)).id;
  const made = (await (await api).command(ctx.user, { action: "page.create", workspaceId: ctx.workspaceId, spaceId: space, parentId, title, kind }, true)) as { id: string };
  return made.id;
}
export async function notesPage(ctx: Ctx) {
  await lockFor(`planner-notes:${ctx.user.id}:${ctx.workspaceId}`);
  const settings = await plannerSettings(ctx.user.id, ctx.workspaceId);
  const page = await writablePage(ctx.user, settings.notesPageId, ctx.workspaceId, "document");
  if (page) return page.id;
  await requireMember(ctx.user, ctx.workspaceId, "editor");
  const made = await createPrivatePage(ctx, ct("Notizen", "Notes"), "document");
  await run("UPDATE pages SET icon=? WHERE id=?", "note", made);
  await saveSettings(ctx.user.id, ctx.workspaceId, { ...settings, notesPageId: made });
  return made;
}
export async function dayNotesJournal(ctx: Ctx) {
  await lockFor(`planner-journal:${ctx.user.id}:${ctx.workspaceId}`);
  const settings = await plannerSettings(ctx.user.id, ctx.workspaceId);
  const page = await writablePage(ctx.user, settings.journalId, ctx.workspaceId, "journal");
  if (page) return page.id;
  await requireMember(ctx.user, ctx.workspaceId, "editor");
  const made = await createPrivatePage(ctx, ct("Tagesnotizen", "Day notes"), "journal");
  await saveSettings(ctx.user.id, ctx.workspaceId, { ...settings, journalId: made });
  return made;
}
// A note: a document below the notes page, with its planner item.
export async function createNote(ctx: Ctx, input: ItemInput & { id?: string; html?: string }) {
  await requireMember(ctx.user, ctx.workspaceId, "editor");
  const parent = await notesPage(ctx);
  const title = input.title?.trim() || ct("Neue Notiz", "New note");
  const pageId = await createPrivatePage(ctx, title, "document", parent);
  if (input.html) await run("UPDATE documents SET html=? WHERE page_id=?", input.html, pageId);
  return await createItem(ctx, { ...input, kind: "note", title }, {}).then(async (item) => {
    await run("UPDATE planner_items SET page_id=? WHERE id=?", pageId, item.id);
    return { ...item, pageId, title };
  });
}
// The day note of a date: the journal's day (opened or made the way the
// journal's day picker does it); for today and earlier only.
export async function dayNote(ctx: Ctx, day: string) {
  const journalId = await dayNotesJournal(ctx);
  if (day > ctx.today) return { journalId, dayId: null as string | null };
  const existing = await one<{ id: string }>("SELECT id FROM pages WHERE parent_id=? AND journal_date=? AND deleted_at IS NULL", journalId, day);
  if (existing) return { journalId, dayId: existing.id };
  const rolled = (await (await api).command(ctx.user, { action: "journal.roll", pageId: journalId, date: ctx.today, day, workspaceId: ctx.workspaceId }, true)) as { dayId?: string; draft?: boolean };
  return { journalId, dayId: rolled?.draft ? null : rolled?.dayId ?? null };
}
// The text of the day notes of a range of days, for the Today page.
export async function dayNoteTexts(user: Identity, workspaceId: string, from: string, to: string) {
  const settings = await plannerSettings(user.id, workspaceId);
  if (!settings.journalId) return {};
  const out: Record<string, { pageId: string; text: string }> = {};
  for (const r of await all<{ id: string; journal_date: string; html: string | null }>(
    "SELECT p.id,p.journal_date,d.html FROM pages p LEFT JOIN documents d ON d.page_id=p.id WHERE p.parent_id=? AND p.journal_date>=? AND p.journal_date<=? AND p.deleted_at IS NULL",
    settings.journalId,
    from,
    to,
  ))
    out[r.journal_date] = { pageId: r.id, text: htmlLines(r.html || "").slice(0, 2000) };
  return out;
}
// The text of a document's HTML, one line per block.
export function htmlLines(html: string) {
  return html
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|li|h[1-6]|blockquote|pre|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// ---- Folders and tags ----

const folderInput = z.object({ name: z.string().trim().min(1).max(80), color: color.default("gray") });
export async function createFolder(ctx: Ctx, input: unknown) {
  const { name, color: c } = folderInput.parse(input);
  const count = (await one<{ n: number }>("SELECT COUNT(*) n FROM planner_folders WHERE user_id=? AND workspace_id=?", ctx.user.id, ctx.workspaceId))?.n ?? 0;
  if (count >= MAX_FOLDERS) throw new HttpError(400, "Höchstens 200 Ordner.");
  const folder: Folder = { id: id(), name, color: c, position: count + 1 };
  await run("INSERT INTO planner_folders(id,workspace_id,user_id,name,color,position,created_at) VALUES(?,?,?,?,?,?,?)", folder.id, ctx.workspaceId, ctx.user.id, name, c, folder.position, Date.now());
  return folder;
}
const patchMeta = z.object({ name: z.string().trim().min(1).max(80), color, position: z.number().finite() }).partial().strict();
export async function updateFolder(ctx: Ctx, folderId: string, input: unknown) {
  const patch = patchMeta.parse(input);
  await checkFolder(ctx, folderId);
  for (const [key, value] of Object.entries(patch)) await run(`UPDATE planner_folders SET ${key}=? WHERE id=? AND user_id=?`, value as never, folderId, ctx.user.id);
  return (await listFolders(ctx.user.id, ctx.workspaceId)).find((f) => f.id === folderId)!;
}
export async function deleteFolder(ctx: Ctx, folderId: string) {
  await checkFolder(ctx, folderId);
  await run("UPDATE planner_items SET folder_id=NULL,updated_at=? WHERE folder_id=? AND user_id=?", Date.now(), folderId, ctx.user.id);
  await run("DELETE FROM planner_folders WHERE id=? AND user_id=?", folderId, ctx.user.id);
  return { id: folderId };
}
async function checkTag(ctx: Ctx, tagId: string) {
  if (!(await one("SELECT 1 FROM planner_tags WHERE id=? AND user_id=? AND workspace_id=?", tagId, ctx.user.id, ctx.workspaceId))) throw new HttpError(404, "Tag nicht gefunden.");
}
export async function createTag(ctx: Ctx, input: unknown) {
  const { name } = z.object({ name: tagName }).parse(input);
  const [tagId] = await tagIdsFor(ctx, [name]);
  return (await listTags(ctx.user.id, ctx.workspaceId)).find((t) => t.id === tagId)!;
}
export async function updateTag(ctx: Ctx, tagId: string, input: unknown) {
  const patch = patchMeta.parse(input);
  await checkTag(ctx, tagId);
  if (patch.name && (await one("SELECT 1 FROM planner_tags WHERE user_id=? AND workspace_id=? AND lower(name)=lower(?) AND id<>?", ctx.user.id, ctx.workspaceId, patch.name, tagId)))
    throw new HttpError(409, "Diesen Tag gibt es schon.");
  for (const [key, value] of Object.entries(patch)) await run(`UPDATE planner_tags SET ${key}=? WHERE id=? AND user_id=?`, value as never, tagId, ctx.user.id);
  return (await listTags(ctx.user.id, ctx.workspaceId)).find((t) => t.id === tagId)!;
}
export async function deleteTag(ctx: Ctx, tagId: string) {
  await checkTag(ctx, tagId);
  await run("DELETE FROM planner_tags WHERE id=? AND user_id=?", tagId, ctx.user.id);
  return { id: tagId };
}

// ---- The command ----

const base = z.object({ workspaceId: uuid, today: dayText });
const MAX_BATCH = 500;
// Every change of the planner: { action, workspaceId, today, … }. `today`
// is the person's local day (the browser's), used for done days, on-time
// check-ins, waiting follow-ups and new events without a day.
export async function plannerCommand(user: Identity, body: unknown): Promise<unknown> {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = z.string().max(40).parse(input.action);
  const { workspaceId, today } = base.parse(input);
  await requireMember(user, workspaceId);
  if (user.apiScope === "read") throw new HttpError(403, "Dieses API-Token darf nur lesen.");
  return await transaction(async () => {
    const ctx: Ctx = { user, workspaceId, today, settings: await plannerSettings(user.id, workspaceId) };
    const target = () => uuid.parse(input.id);
    switch (action) {
      case "item.create": {
        const fields = itemFields.parse(input.item);
        const clientId = input.item && typeof input.item === "object" && "id" in input.item ? uuid.parse((input.item as { id: unknown }).id) : undefined;
        if (fields.kind === "note") return await createNote(ctx, { ...fields, id: clientId });
        return await createItem(ctx, { ...fields, id: clientId });
      }
      case "item.update":
        return await updateItem(ctx, target(), itemFields.parse(input.patch));
      case "items.update": {
        const ids = z.array(uuid).min(1).max(MAX_BATCH).parse(input.ids);
        const patch = itemFields.parse(input.patch);
        const out = [];
        for (const itemId of ids) out.push(await updateItem(ctx, itemId, patch));
        return out;
      }
      case "item.done":
        return await setDone(ctx, target(), z.boolean().parse(input.done));
      case "item.delete":
        return await deleteItem(ctx, target());
      case "item.restore":
        return await restoreItem(ctx, target());
      case "habit.check":
        return await checkIn(ctx, target(), dayText.parse(input.day), z.boolean().parse(input.done));
      case "folder.create":
        return await createFolder(ctx, input.folder);
      case "folder.update":
        return await updateFolder(ctx, target(), input.patch);
      case "folder.delete":
        return await deleteFolder(ctx, target());
      case "tag.create":
        return await createTag(ctx, input.tag);
      case "tag.update":
        return await updateTag(ctx, target(), input.patch);
      case "tag.delete":
        return await deleteTag(ctx, target());
      case "settings.update": {
        const patch = settingsPatch.parse(input.patch);
        const next = { ...ctx.settings, ...patch };
        if (next.workEnd <= next.workStart) throw new HttpError(400, "Die Arbeitszeit endet nach ihrem Beginn.");
        await saveSettings(user.id, workspaceId, next);
        return next;
      }
      case "dayNote.open":
        return await dayNote(ctx, dayText.parse(input.day));
      case "thisday.import": {
        const { applyThisDayExport } = await import("./thisday-server");
        return await applyThisDayExport(ctx, input.export, { force: input.force === true });
      }
      case "thisday.resend": {
        const next = { ...ctx.settings, thisday: { ...ctx.settings.thisday, sent: [] } };
        await saveSettings(user.id, workspaceId, next);
        return next;
      }
      case "legacy.import": {
        const { importLegacyBackup } = await import("./legacy");
        return await importLegacyBackup(ctx, input.backup);
      }
      default:
        throw new HttpError(400, "Unbekannte Aktion.");
    }
  }, user);
}
export type PlannerCtx = Ctx;
