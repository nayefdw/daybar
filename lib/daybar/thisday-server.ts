// ThisDay sync on the server (lib/daybar/thisday.ts has the rules): an
// uploaded export is merged into the person's planner in one transaction,
// and the outbox – the adds and ticks ThisDay has not seen – is served as
// to-thisday.json for the iPhone Shortcut (app/api/planner/[...path]).
import { all, id, one, run } from "../db";
import { HttpError } from "../auth";
import { DAILY } from "./repeat";
import { blankItem, descendants, htmlLines, normalized, plannerSettings, saveSettings, writeItem, type PlannerCtx } from "./store";
import type { PlannerItem, PlannerSettings } from "./model";
import { folderColor, fromThisDay, holdsTooMany, isThisDayExport, mergeThisDay, outbox, sendDoc, type Change, type HeldItem, type OutboxItem, type SyncCategory, type SyncItem } from "./thisday";

type HeldRow = {
  id: string;
  kind: PlannerItem["kind"];
  title: string;
  page_title: string | null;
  day: string | null;
  time: string | null;
  source: PlannerItem["source"];
  external_id: string | null;
  source_done: string | null;
  done_day: string | null;
  done_at: number | null;
  deleted_at: number | null;
  body: string;
  page_html: string | null;
};
const days = (text: string | null): string[] | null => {
  if (text === null) return null;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-2000) : [];
  } catch {
    return [];
  }
};

// The person's top-level items the sync looks at: ThisDay's (also those in
// the trash, which an import brings back) and their own sendable ones.
async function heldRows(ctx: PlannerCtx, withText = false) {
  return await all<HeldRow>(
    `SELECT i.id,i.kind,i.title,p.title AS page_title,i.day,i.time,i.source,i.external_id,i.source_done,i.done_day,i.done_at,i.deleted_at,i.body,${withText ? "d.html" : "NULL"} AS page_html
     FROM planner_items i LEFT JOIN pages p ON p.id=i.page_id ${withText ? "LEFT JOIN documents d ON d.page_id=i.page_id" : ""}
     WHERE i.user_id=? AND i.workspace_id=? AND i.parent_id IS NULL AND (i.page_id IS NULL OR p.deleted_at IS NULL)
       AND ((i.source='thisday' AND i.external_id IS NOT NULL) OR (i.deleted_at IS NULL AND i.source<>'thisday' AND i.kind IN ('task','note','event')))`,
    ctx.user.id,
    ctx.workspaceId,
  );
}
async function habitDays(ids: string[]) {
  const map = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const l of await all<{ item_id: string; day: string }>(`SELECT item_id,day FROM planner_habit_log WHERE item_id IN (${chunk.map(() => "?").join(",")}) ORDER BY day`, ...chunk))
      map.set(l.item_id, [...(map.get(l.item_id) || []), l.day]);
  }
  return map;
}
async function heldItems(ctx: PlannerCtx, withText = false): Promise<(HeldItem & { row: HeldRow })[]> {
  const rows = await heldRows(ctx, withText);
  const logs = await habitDays(rows.filter((r) => r.kind === "habit").map((r) => r.id));
  return rows.map((r) => ({
    row: r,
    id: r.id,
    kind: r.kind,
    title: r.kind === "note" && r.page_title != null ? r.page_title : r.title,
    day: r.day,
    externalId: r.source === "thisday" ? r.external_id : null,
    doneDays: r.kind === "habit" ? logs.get(r.id) || [] : r.done_day ? [r.done_day] : r.done_at ? [r.day || ""].filter(Boolean) : [],
    sourceDone: r.source === "thisday" ? days(r.source_done) ?? [] : null,
    legacy: r.source === "legacy",
    deleted: !!r.deleted_at,
  }));
}

// ThisDay's categories as folders: ThisDay leads on name and colour; a
// category seen before keeps its folder (also when renamed there).
async function syncFolders(ctx: PlannerCtx, categories: SyncCategory[], known: Record<string, string>) {
  const map: Record<string, string> = {};
  for (const c of categories) {
    let folderId: string | undefined = known[c.id];
    if (folderId && !(await one("SELECT 1 FROM planner_folders WHERE id=? AND user_id=? AND workspace_id=?", folderId, ctx.user.id, ctx.workspaceId))) folderId = undefined;
    folderId ??= (await one<{ id: string }>("SELECT id FROM planner_folders WHERE user_id=? AND workspace_id=? AND lower(name)=lower(?)", ctx.user.id, ctx.workspaceId, c.name))?.id;
    if (folderId) await run("UPDATE planner_folders SET name=?,color=? WHERE id=? AND user_id=?", c.name, folderColor(c.color), folderId, ctx.user.id);
    else {
      folderId = id();
      await run(
        "INSERT INTO planner_folders(id,workspace_id,user_id,name,color,position,created_at) VALUES(?,?,?,?,?,?,?)",
        folderId,
        ctx.workspaceId,
        ctx.user.id,
        c.name,
        folderColor(c.color),
        c.position,
        Date.now(),
      );
    }
    map[c.id] = folderId;
  }
  return map;
}

// One of ThisDay's items written here: new, updated, back from the trash,
// or an own item that becomes ThisDay's. ThisDay's fields win; `doneDays`
// are ThisDay's plus ticks made here it has not seen, `item.doneDays`
// ThisDay's own (kept as source_done).
async function writeSync(ctx: PlannerCtx, existingId: string | null, t: SyncItem, doneDays: string[], folders: Record<string, string>) {
  const at = Date.now();
  const current = existingId
    ? await one<{ done_at: number | null; created_at: number; position: number; page_id: string | null; favorite: number; favorite_position: number | null; in_progress: number; waiting_until: string | null; follow_ups: number }>(
        "SELECT done_at,created_at,position,page_id,favorite,favorite_position,in_progress,waiting_until,follow_ups FROM planner_items WHERE id=? AND user_id=?",
        existingId,
        ctx.user.id,
      )
    : undefined;
  const base = blankItem(t.kind, t.createdAt || at);
  const item = normalized(
    {
      ...base,
      id: existingId || base.id,
      title: t.title,
      body: t.body,
      pageId: current?.page_id ?? null,
      day: t.day,
      time: t.time,
      duration: t.kind === "task" ? t.duration : null,
      period: t.kind === "task" && t.someday && !t.day ? "someday" : null,
      priority: t.kind === "task" ? t.priority : 0,
      inProgress: !!current?.in_progress,
      waitingUntil: current?.waiting_until ?? null,
      followUps: current?.follow_ups ?? 0,
      location: t.location,
      link: t.link,
      remindAt: t.kind === "note" ? null : t.remindAt,
      repeat: t.kind === "habit" ? t.repeat ?? DAILY : null,
      folderId: t.categoryId ? folders[t.categoryId] ?? null : null,
      favorite: !!current?.favorite,
      favoritePosition: current?.favorite_position ?? null,
      doneAt: t.kind !== "habit" && doneDays.length ? current?.done_at ?? at : null,
      doneDay: t.kind !== "habit" && doneDays.length ? doneDays[0] : null,
      position: current?.position ?? base.position,
      source: "thisday",
      externalId: t.externalId,
      createdAt: current?.created_at ?? base.createdAt,
      updatedAt: at,
    },
    t.day || ctx.today,
    ctx.settings,
  );
  // An event without a time is all-day on its day; a note keeps its day.
  if (t.kind === "event" && !t.day) item.day = ctx.today;
  if (existingId) {
    await writeItem(ctx, item, true);
    await run("UPDATE planner_items SET source='thisday',external_id=?,source_done=?,deleted_at=NULL WHERE id=? AND user_id=?", t.externalId, JSON.stringify(t.doneDays), existingId, ctx.user.id);
  } else await writeItem(ctx, item, false, { source: "thisday", externalId: t.externalId, sourceDone: JSON.stringify(t.doneDays) });
  if (t.kind === "habit") {
    const wanted = new Set(doneDays);
    for (const l of await all<{ day: string }>("SELECT day FROM planner_habit_log WHERE item_id=?", item.id))
      if (!wanted.has(l.day)) await run("DELETE FROM planner_habit_log WHERE item_id=? AND day=?", item.id, l.day);
    for (const d of wanted) await run("INSERT INTO planner_habit_log(item_id,day,done_at,on_time) VALUES(?,?,?,1) ON CONFLICT(item_id,day) DO NOTHING", item.id, d, at);
  }
  if (t.kind === "task") await writeSteps(ctx, item.id, t);
  return item.id;
}
// ThisDay's steps as subtasks (ThisDay's, so ThisDay's again at each import).
async function writeSteps(ctx: PlannerCtx, parentId: string, t: SyncItem) {
  const children = await all<{ id: string; external_id: string | null }>(
    "SELECT id,external_id FROM planner_items WHERE parent_id=? AND user_id=? AND source='thisday'",
    parentId,
    ctx.user.id,
  );
  const at = Date.now();
  for (const [i, step] of t.steps.entries()) {
    const key = `${t.externalId}#${i}`;
    const child = children.find((c) => c.external_id === key);
    const done = step.done ? at : null;
    if (child)
      await run(
        "UPDATE planner_items SET title=?,done_at=CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(done_at,?) END,done_day=CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(done_day,?) END,deleted_at=NULL,position=?,updated_at=? WHERE id=?",
        step.title,
        done,
        at,
        done,
        ctx.today,
        i,
        at,
        child.id,
      );
    else {
      const item: PlannerItem = { ...blankItem("task", at), title: step.title, parentId, position: i, doneAt: done, doneDay: done ? ctx.today : null };
      await writeItem(ctx, item, false, { source: "thisday", externalId: key, sourceDone: "[]" });
    }
  }
  const keep = new Set(t.steps.map((_, i) => `${t.externalId}#${i}`));
  for (const c of children) if (!c.external_id || !keep.has(c.external_id)) await run("DELETE FROM planner_items WHERE id=? AND user_id=?", c.id, ctx.user.id);
}

export type ImportResult =
  | { status: "ok"; added: number; updated: number; removed: number; adopted: number; settings: PlannerSettings }
  | { status: "old"; lastExport: string }
  | { status: "held"; removed: number };

// An uploaded ThisDay export, merged into the planner (inside the planner
// command's transaction). `force` imports one that was held back.
export async function applyThisDayExport(ctx: PlannerCtx, raw: unknown, { force = false } = {}): Promise<ImportResult> {
  if (!isThisDayExport(raw)) throw new HttpError(400, "Das ist kein ThisDay-Export.");
  const exp = fromThisDay(raw, ctx.today);
  if (exp.formatVersion && exp.formatVersion < 2) throw new HttpError(400, "Dieser ThisDay-Export ist zu alt; Daybar liest Format 2.");
  const sync = ctx.settings.thisday;
  if (sync.lastExport && exp.exportedAt && exp.exportedAt < sync.lastExport) return { status: "old", lastExport: sync.lastExport };
  const held = await heldItems(ctx);
  const plan = mergeThisDay(held, exp.items);
  const ours = held.filter((h) => h.sourceDone && !h.deleted).length;
  if (!force && holdsTooMany(plan.remove.length, ours)) return { status: "held", removed: plan.remove.length };
  const folders = await syncFolders(ctx, exp.categories, sync.folders);
  const before = new Map(held.map((h) => [h.id, h]));
  let updated = 0;
  for (const a of plan.add) await writeSync(ctx, null, a.item, a.doneDays, folders);
  for (const u of plan.update) {
    const h = before.get(u.id)!;
    // Counted as updated only when ThisDay changed something here.
    if (h.deleted || h.title !== u.item.title || h.day !== u.item.day || h.doneDays.join() !== u.doneDays.join()) updated++;
    await writeSync(ctx, u.id, u.item, u.doneDays, folders);
  }
  for (const a of plan.adopt) await writeSync(ctx, a.id, a.item, a.doneDays, folders);
  const at = Date.now();
  for (const itemId of plan.remove)
    for (const target of [itemId, ...(await descendants(ctx, itemId))]) await run("UPDATE planner_items SET deleted_at=?,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL", at, at, target, ctx.user.id);
  // Sends ThisDay now shows are forgotten.
  const keys = new Set((await outboxChanges(ctx, [])).map((c) => c.key));
  const settings: PlannerSettings = {
    ...(await plannerSettings(ctx.user.id, ctx.workspaceId)),
  };
  settings.thisday = { lastExport: exp.exportedAt || sync.lastExport, sent: sync.sent.filter((k) => keys.has(k)), lastImport: at, folders: { ...sync.folders, ...folders } };
  await saveSettings(ctx.user.id, ctx.workspaceId, settings);
  return { status: "ok", added: plan.add.length, updated, removed: plan.remove.length, adopted: plan.adopt.length, settings };
}

// The changes for ThisDay: adds of the person's own open tasks, notes and
// events, ticks of ThisDay's items made here. `sent`: keys sent before.
export async function outboxChanges(ctx: PlannerCtx, sent: readonly string[] = ctx.settings.thisday.sent): Promise<Change[]> {
  const held = await heldItems(ctx, true);
  const items: OutboxItem[] = held
    .filter((h) => !h.deleted)
    .map((h) => ({
      ...h,
      time: h.row.time,
      notes: (h.row.page_html !== null ? htmlLines(h.row.page_html) : h.row.body).slice(0, 5000),
      open: !h.row.done_at,
      topLevel: true,
    }));
  return outbox(items, sent);
}
// to-thisday.json: the changes not sent yet; `mark` remembers them as sent
// (the iPhone Shortcut fetched them), as writing the file did before.
export async function serveOutbox(ctx: PlannerCtx, mark: boolean) {
  const pending = (await outboxChanges(ctx)).filter((c) => !c.sent);
  if (mark && pending.length) {
    const settings = await plannerSettings(ctx.user.id, ctx.workspaceId);
    settings.thisday = { ...settings.thisday, sent: [...settings.thisday.sent, ...pending.map((c) => c.key)].slice(-2000) };
    await saveSettings(ctx.user.id, ctx.workspaceId, settings);
  }
  return sendDoc(pending);
}
