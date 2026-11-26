// Sync with ThisDay (lib/daybar/thisday.ts, lib/daybar/thisday-server.ts)
// and the old Daybar page's backup (lib/daybar/legacy.ts), with synthetic
// exports only – never a real one. "Today" is 26 November 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Identity } from "../lib/types";
import { fromThisDay, mergeThisDay, outbox, pendingTicks, sendDoc, tdDay, tdLocal, type HeldItem, type OutboxItem } from "../lib/daybar/thisday";
import { legacyItem, legacyKind, legacyRule, readLegacyBackup } from "../lib/daybar/legacy";

process.env.FLOWPLAN_DATA_DIR = mkdtempSync(join(tmpdir(), "flowplan-daybar-thisday-"));
const { id, run, one, all } = await import("../lib/db");
const { createWorkspace } = await import("../lib/seed");
const { plannerCommand, plannerState, plannerSettings } = await import("../lib/daybar/store");
const { serveOutbox, outboxChanges } = await import("../lib/daybar/thisday-server");
const { transaction } = await import("../lib/db");

const TODAY = "2026-11-26";
// ThisDay's ids are uppercase UUIDs.
const T = (n: number) => `AAAAAAAA-0000-4000-8000-${String(n).padStart(12, "0")}`;
const H = (n: number) => `BBBBBBBB-0000-4000-8000-${String(n).padStart(12, "0")}`;

function exportOf(over: Record<string, unknown> = {}) {
  return {
    formatVersion: 2,
    exportedAt: "2026-11-26T08:00:00Z",
    timeZone: "Europe/London",
    categories: [
      { id: "C-1", name: "Gym", color: "graphite", sortIndex: 1 },
      { id: "C-2", name: "Work", color: "blue", sortIndex: 0 },
    ],
    tasks: [
      { id: T(1), kind: "task", list: "day", day: "2026-11-26T00:00:00Z", title: "Dentist call", priority: "high", scheduledAt: "2026-11-26T09:30:00Z", durationMinutes: 30, isCompleted: false, category: "Work", steps: [{ title: "Find number", isCompleted: true }, { title: "Call", isCompleted: false }], timeZone: "Europe/London" },
      { id: T(2), kind: "location", list: "day", day: "2026-11-25T00:00:00Z", title: "Clinic", address: "1 Main St", isCompleted: true, completedAt: "2026-11-25T10:00:00Z", priority: "low" },
      { id: T(3), kind: "task", list: "someday", day: "2026-11-24T00:00:00Z", title: "Learn Welsh", priority: "none", isCompleted: false },
      { id: T(4), kind: "event", list: "day", day: "2026-11-27T00:00:00Z", title: "Team lunch", scheduledAt: "2026-11-27T12:00:00Z", durationMinutes: 60, isCompleted: false },
    ],
    notes: [{ id: T(5), list: "day", day: "2026-11-26T00:00:00Z", title: "Idea", notes: "Bake bread", createdAt: "2026-11-26T07:00:00Z" }],
    voiceCaptures: [],
    habits: [{ id: H(1), title: "Lift", emoji: "✨", weekdays: [2, 4, 6], createdAt: "2026-11-02T18:00:00Z", timeZone: "Europe/London", category: "Gym" }],
    habitLogs: [
      { day: "2026-11-23T00:00:00Z", habitID: H(1), value: 1 },
      { day: "2026-11-25T00:00:00Z", habitID: H(1), value: 1 },
      { day: "2026-11-24T00:00:00Z", habitID: H(1), value: 0 },
    ],
    moments: [{ id: T(6), day: "2026-11-20T00:00:00Z", photoCount: 2, text: "" }],
    ...over,
  };
}

// ---- The rules, pure ----

test("ThisDay's days and times read in the item's own zone", () => {
  assert.equal(tdDay("2026-09-22T23:00:00Z"), "2026-09-23");
  assert.equal(tdDay("2026-11-25T00:00:00Z"), "2026-11-25");
  assert.equal(tdDay("2026-01-01T05:00:00Z"), "2026-01-01");
  assert.deepEqual(tdLocal("2026-09-24T16:30:00Z", "Europe/London"), ["2026-09-24", "17:30"]);
  assert.deepEqual(tdLocal("2026-12-01T16:30:00Z", "Europe/London"), ["2026-12-01", "16:30"]);
  assert.deepEqual(tdLocal("nonsense", "Europe/London"), [null, null]);
});

test("an export becomes tasks, events, notes and habits", () => {
  const exp = fromThisDay(exportOf(), TODAY);
  const by = (x: string) => exp.items.find((i) => i.externalId === x)!;
  assert.deepEqual([by(T(1)).kind, by(T(1)).day, by(T(1)).time, by(T(1)).priority, by(T(1)).duration, by(T(1)).categoryId], ["task", "2026-11-26", "09:30", 3, 30, "C-2"]);
  assert.deepEqual(by(T(1)).steps, [{ title: "Find number", done: true }, { title: "Call", done: false }]);
  assert.deepEqual([by(T(2)).kind, by(T(2)).location, by(T(2)).doneDays], ["task", "1 Main St", ["2026-11-25"]]);
  assert.deepEqual([by(T(3)).day, by(T(3)).someday], [null, true]);
  assert.deepEqual([by(T(4)).kind, by(T(4)).time], ["event", "12:00"]);
  assert.deepEqual([by(T(5)).kind, by(T(5)).body], ["note", "Bake bread"]);
  // Weekdays Mon, Wed, Fri (ThisDay counts Sunday as 1); check-ins with a value.
  const lift = by(H(1));
  assert.deepEqual([lift.kind, lift.repeat?.unit, lift.repeat?.weekdays, lift.doneDays, lift.day, lift.categoryId], ["habit", "week", [1, 3, 5], ["2026-11-23", "2026-11-25"], "2026-11-02", "C-1"]);
  assert.equal(by(T(6)).title, "2 photos in ThisDay");
  assert.deepEqual(exp.categories.map((c) => [c.name, c.color]), [["Work", "blue"], ["Gym", "gray"]]);
});

test("the merge: ThisDay wins, ticks made here survive, twins are adopted, removals listed", () => {
  const held: HeldItem[] = [
    { id: "a", kind: "task", title: "A", day: "2026-11-20", externalId: T(1), doneDays: ["2026-11-26"], sourceDone: [] },
    { id: "h", kind: "habit", title: "H", day: "2026-11-01", externalId: H(1), doneDays: ["2026-11-24", "2026-11-25"], sourceDone: ["2026-11-24"] },
    { id: "mine", kind: "task", title: "Milk", day: "2026-11-27", externalId: null, doneDays: ["2026-11-26"], sourceDone: null },
    { id: "gone", kind: "task", title: "Gone", day: null, externalId: T(9), doneDays: [], sourceDone: [] },
  ];
  const base = { body: "", time: null, duration: null, someday: false, priority: 0 as const, steps: [], remindAt: null, link: null, location: "", repeat: null, categoryId: null, createdAt: 0 };
  const plan = mergeThisDay(held, [
    { ...base, externalId: T(1), kind: "task", title: "A2", day: "2026-11-20", doneDays: [] },
    { ...base, externalId: H(1), kind: "habit", title: "H", day: "2026-11-01", doneDays: ["2026-11-24"] },
    { ...base, externalId: T(7), kind: "task", title: " milk ", day: "2026-11-27", doneDays: [] },
    { ...base, externalId: T(8), kind: "task", title: "New", day: null, doneDays: [] },
  ]);
  assert.deepEqual(plan.update.map((u) => [u.id, u.item.title, u.doneDays]), [["a", "A2", ["2026-11-26"]], ["h", "H", ["2026-11-24", "2026-11-25"]]]);
  assert.deepEqual(plan.adopt.map((a) => [a.id, a.item.externalId, a.doneDays]), [["mine", T(7), ["2026-11-26"]]]);
  assert.deepEqual(plan.add.map((a) => a.item.externalId), [T(8)]);
  assert.deepEqual(plan.remove, ["gone"]);
  assert.deepEqual(pendingTicks({ kind: "habit", externalId: H(1), doneDays: ["2026-11-24", "2026-11-25"], sourceDone: ["2026-11-24"] }), ["2026-11-25"]);
  assert.deepEqual(pendingTicks({ kind: "task", externalId: T(1), doneDays: ["2026-11-26"], sourceDone: [] }), ["2026-11-26"]);
  assert.deepEqual(pendingTicks({ kind: "task", externalId: T(1), doneDays: ["2026-11-26"], sourceDone: ["2026-11-26"] }), []);
});

test("the outbox: adds of own open items, ticks of ThisDay's, with their keys", () => {
  const items: OutboxItem[] = [
    { id: "t1", kind: "task", title: "A", day: "2026-11-20", externalId: T(1), doneDays: ["2026-11-25"], sourceDone: [], time: null, notes: "", open: false, topLevel: true },
    { id: "h1", kind: "habit", title: "H", day: "2026-11-01", externalId: H(1), doneDays: ["2026-11-24", "2026-11-25"], sourceDone: ["2026-11-24"], time: null, notes: "", open: true, topLevel: true },
    { id: "local-1", kind: "task", title: "Milk", day: "2026-11-26", externalId: null, doneDays: [], sourceDone: null, time: "09:00", notes: "", open: true, topLevel: true },
    { id: "local-2", kind: "habit", title: "Own habit", day: "2026-11-26", externalId: null, doneDays: [], sourceDone: null, time: null, notes: "", open: true, topLevel: true },
    { id: "local-3", kind: "task", title: "From the page", day: null, externalId: null, doneDays: [], sourceDone: null, time: null, notes: "", open: true, topLevel: true, legacy: true },
  ];
  const changes = outbox(items, ["add:local-1"]);
  assert.deepEqual(
    changes.map((c) => [c.key, c.action, c.date, c.when, c.sent]),
    [
      [`tick:${T(1)}:2026-11-25`, "tick", "2026-11-25", "2026-11-25", false],
      [`tick:${H(1)}:2026-11-25`, "tick", "2026-11-25", "2026-11-25", false],
      ["add:local-1", "add", "2026-11-26", "2026-11-26 09:00", true],
    ],
  );
  const doc = sendDoc(changes, "2026-11-26T10:00:00Z");
  assert.deepEqual([doc.app, doc.kind, doc.version, doc.changes.length], ["Daybar", "to-thisday", 1, 3]);
  assert.equal("sent" in doc.changes[0], false);
});

test("the old page's items: normalized, kinds and rules", () => {
  assert.equal(legacyItem({ id: "settings", type: "task", title: "x" }), null);
  assert.equal(legacyItem({ id: "a b", type: "task", title: "x" }), null);
  assert.equal(legacyItem({ id: "x1", type: "spaceship", title: "x" }), null);
  const ev = legacyItem({ id: "e1", type: "event", title: " Talk ", time: "09:00", end: "09:45", link: "javascript:alert(1)" })!;
  assert.deepEqual([ev.title, ev.duration, ev.link], ["Talk", 45, null]);
  assert.equal(legacyKind({ type: "voice", repeat: "none" }), "note");
  assert.equal(legacyKind({ type: "task", repeat: "weekly" }), "habit");
  assert.deepEqual(legacyRule({ repeat: "weekly", days: [], date: "2026-11-26" }).weekdays, [4]);
  assert.deepEqual(legacyRule({ repeat: "monthly", days: [], date: "2026-01-31" }).monthDay, 31);
  assert.throws(() => readLegacyBackup({ app: "Daybar" }), /Sicherung/);
});

// ---- Applied to a planner ----

async function account(name: string): Promise<Identity> {
  const uid = id();
  await run("INSERT INTO users(id,subject,name,email) VALUES(?,?,?,?)", uid, uid, name, `${name}@test.invalid`);
  return { id: uid, name, email: `${name}@test.invalid`, groups: [], isAdmin: false, disabled: 0, created_at: "" } as Identity;
}
const nia = await account("Nia");
const wid = await createWorkspace(nia.id, "Nia's");
const act = async (body: Record<string, unknown>, as = nia): Promise<any> => await plannerCommand(as, { workspaceId: wid, today: TODAY, ...body });
const items = async (): Promise<any[]> => (await plannerState(nia, wid, TODAY)).items;
const ext = async (externalId: string): Promise<any> => (await items()).find((i: { externalId: string | null }) => i.externalId === externalId);
const ctx = async () => ({ user: nia, workspaceId: wid, today: TODAY, settings: await plannerSettings(nia.id, wid) });

test("an import adds ThisDay's items with folders, subtasks and check-ins", async () => {
  // An own task that was sent to ThisDay before and comes back as T(7).
  const sent = await act({ action: "item.create", item: { kind: "task", title: "Buy stamps", day: "2026-11-27" } });
  await act({ action: "item.done", id: sent.id, done: true });
  const result = await act({ action: "thisday.import", export: exportOf({ tasks: [...exportOf().tasks, { id: T(7), kind: "task", list: "day", day: "2026-11-27T00:00:00Z", title: "buy stamps", isCompleted: false }] }) });
  assert.deepEqual([result.status, result.added, result.adopted, result.removed], ["ok", 7, 1, 0]);
  const dentist = await ext(T(1));
  assert.deepEqual([dentist.kind, dentist.time, dentist.priority, dentist.source], ["task", "09:30", 3, "thisday"]);
  const folders: any[] = (await plannerState(nia, wid, TODAY)).folders;
  assert.equal(folders.find((f: { id: string }) => f.id === dentist.folderId).name, "Work");
  const steps = (await items()).filter((i: { parentId: string | null }) => i.parentId === dentist.id);
  assert.deepEqual(steps.map((s: { title: string; doneAt: number | null }) => [s.title, !!s.doneAt]), [["Find number", true], ["Call", false]]);
  const lift = await ext(H(1));
  assert.deepEqual(lift.repeat.weekdays, [1, 3, 5]);
  const logs = (await plannerState(nia, wid, TODAY)).logs.filter((l: { itemId: string }) => l.itemId === lift.id).map((l: { day: string }) => l.day);
  assert.deepEqual(logs, ["2026-11-23", "2026-11-25"]);
  // The twin: the own item became ThisDay's, with the tick made here.
  const twin = (await items()).find((i: { id: string }) => i.id === sent.id);
  assert.deepEqual([twin.source, twin.externalId, !!twin.doneAt], ["thisday", T(7), true]);
  assert.equal((await items()).filter((i: { title: string }) => /stamps/i.test(i.title)).length, 1);
});

test("the outbox serves adds and ticks once; peeking changes nothing", async () => {
  const own = await act({ action: "item.create", item: { kind: "task", title: "Water plants", day: TODAY, time: "18:00" } });
  const dentist = await ext(T(1));
  await act({ action: "item.done", id: dentist.id, done: true });
  const lift = await ext(H(1));
  await act({ action: "habit.check", id: lift.id, day: TODAY, done: true });
  const c = await ctx();
  const peek = await serveOutbox(c, false);
  const keys = peek.changes.map((x: { key: string }) => x.key).sort();
  assert.deepEqual(keys, [`add:${own.id}`, `tick:${H(1)}:${TODAY}`, `tick:${T(1)}:${TODAY}`, `tick:${T(7)}:${TODAY}`].sort());
  assert.equal(peek.changes.find((x: { key: string }) => x.key === `add:${own.id}`)!.when, `${TODAY} 18:00`);
  // Fetched by the Shortcut: sent, not served again.
  const served = await transaction(async () => await serveOutbox(await ctx(), true));
  assert.equal(served.changes.length, 4);
  assert.equal((await serveOutbox(await ctx(), true)).changes.length, 0);
  assert.equal((await outboxChanges(await ctx())).filter((x) => x.sent).length, 4);
  // "Send again" forgets what was sent.
  await act({ action: "thisday.resend" });
  assert.equal((await serveOutbox(await ctx(), false)).changes.length, 4);
  await transaction(async () => await serveOutbox(await ctx(), true));
});

test("the next export: ticks ThisDay shows are forgotten, sent adds come back as twins", async () => {
  const own = (await items()).find((i: { title: string }) => i.title === "Water plants");
  const next = exportOf({
    exportedAt: "2026-11-26T20:00:00Z",
    tasks: [
      { ...exportOf().tasks[0], isCompleted: true, completedAt: "2026-11-26T15:00:00Z" },
      ...exportOf().tasks.slice(1),
      { id: T(7), kind: "task", list: "day", day: "2026-11-27T00:00:00Z", title: "buy stamps", isCompleted: true, completedAt: "2026-11-26T12:00:00Z" },
      { id: T(10), kind: "task", list: "day", day: "2026-11-26T00:00:00Z", title: "Water plants", scheduledAt: "2026-11-26T18:00:00Z", isCompleted: false },
    ],
    habitLogs: [...exportOf().habitLogs, { day: "2026-11-26T00:00:00Z", habitID: H(1), value: 1 }],
  });
  const result = await act({ action: "thisday.import", export: next });
  assert.deepEqual([result.status, result.adopted, result.added], ["ok", 1, 0]);
  assert.equal((await items()).find((i: { id: string }) => i.id === own.id).externalId, T(10));
  // Nothing left to send, and nothing remembered as sent.
  assert.deepEqual((await outboxChanges(await ctx())).map((x) => x.key), []);
  assert.deepEqual((await plannerSettings(nia.id, wid)).thisday.sent, []);
  assert.equal((await plannerSettings(nia.id, wid)).thisday.lastExport, "2026-11-26T20:00:00Z");
});

test("older exports are refused; one removing many items waits for a confirmation", async () => {
  assert.deepEqual(await act({ action: "thisday.import", export: exportOf({ exportedAt: "2026-11-25T08:00:00Z" }) }), { status: "old", lastExport: "2026-11-26T20:00:00Z" });
  await assert.rejects(act({ action: "thisday.import", export: { tasks: "no" } }), /kein ThisDay-Export/);
  await assert.rejects(act({ action: "thisday.import", export: { ...exportOf(), formatVersion: 1 } }), /zu alt/);
  // 30 more of ThisDay's items, then an export without any of them.
  const many = Array.from({ length: 30 }, (_, i) => ({ id: T(100 + i), kind: "task", list: "inbox", title: `Thing ${i}`, isCompleted: false }));
  const full = await act({ action: "thisday.import", export: exportOf({ exportedAt: "2026-11-27T08:00:00Z", tasks: [...exportOf().tasks, ...many] }) });
  assert.equal(full.added, 30);
  const empty = exportOf({ exportedAt: "2026-11-27T09:00:00Z", tasks: [], notes: [], habits: [], moments: [] });
  const held = await act({ action: "thisday.import", export: empty });
  assert.equal(held.status, "held");
  assert.ok(held.removed > 20);
  assert.equal((await items()).filter((i: { source: string }) => i.source === "thisday").length > 30, true);
  const forced = await act({ action: "thisday.import", export: empty, force: true });
  assert.equal(forced.status, "ok");
  assert.equal((await items()).filter((i: { source: string; parentId: string | null }) => i.source === "thisday" && !i.parentId).length, 0);
  // A later export brings them back from the trash, not twice.
  await act({ action: "thisday.import", export: exportOf({ exportedAt: "2026-11-27T10:00:00Z" }) });
  assert.equal((await all("SELECT id FROM planner_items WHERE user_id=? AND external_id=?", nia.id, T(1))).length, 1);
  assert.equal((await ext(T(1))).deletedAt, null);
});

test("the old page's backup moves over; again, it updates instead of doubling", async () => {
  const backup = {
    app: "Daybar",
    version: 3,
    exportedAt: "2026-11-26T09:00:00Z",
    categories: [{ id: "errands", name: "Errands", color: "orange" }],
    items: [
      { id: "l-1", type: "task", title: "Post parcel", date: "2026-11-27", time: "11:00", priority: "medium", category: "errands", checklist: [{ t: "Tape", d: true }], remind: "10:30", address: "Post office", doneOn: [] },
      { id: "l-2", type: "event", title: "Concert", date: "2026-12-05", time: "19:30", duration: 120 },
      { id: "l-3", type: "habit", title: "Read", date: "2026-11-01", repeat: "weekdays", doneOn: ["2026-11-24", "2026-11-25"] },
      { id: "l-4", type: "voice", title: "Thought", notes: "Say it out loud", date: "2026-11-26" },
      { id: "l-5", type: "task", title: "Done thing", date: "2026-11-20", doneOn: ["2026-11-21"] },
      { id: T(200), type: "task", title: "From ThisDay via the page", date: "2026-11-26", doneOn: ["2026-11-26"], tdDone: [] },
      { id: "bad", type: "task", title: "" },
    ],
  };
  const first = await act({ action: "legacy.import", backup });
  assert.deepEqual([first.added, first.updated, first.folders], [6, 0, 1]);
  const by = async (externalId: string): Promise<any> => (await items()).find((i: { externalId: string | null }) => i.externalId === externalId);
  const parcel = await by("l-1");
  assert.deepEqual([parcel.kind, parcel.time, parcel.priority, parcel.location, parcel.remindAt, parcel.source], ["task", "11:00", 2, "Post office", "2026-11-27T10:30", "legacy"]);
  assert.equal((await items()).filter((i: { parentId: string | null }) => i.parentId === parcel.id).length, 1);
  const concert = await by("l-2");
  assert.deepEqual([concert.kind, concert.endTime], ["event", "21:30"]);
  const read = await by("l-3");
  assert.deepEqual([read.kind, read.repeat.weekdays], ["habit", [1, 2, 3, 4, 5]]);
  assert.deepEqual([(await by("l-4")).kind, (await by("l-4")).body], ["note", "Say it out loud"]);
  assert.equal((await by("l-5")).doneDay, "2026-11-21");
  // ThisDay's item keeps syncing: its tick made on the page is pending.
  const td = await by(T(200));
  assert.equal(td.source, "thisday");
  assert.ok((await outboxChanges(await ctx())).some((c) => c.key === `tick:${T(200)}:2026-11-26`));
  // The page's own items are not sent to ThisDay from here.
  assert.equal((await outboxChanges(await ctx())).some((c) => c.key === `add:${parcel.id}`), false);
  const again = await act({ action: "legacy.import", backup });
  assert.deepEqual([again.added, again.updated], [0, 6]);
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) n FROM planner_items WHERE user_id=? AND external_id='l-1'", nia.id))!.n, 1);
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) n FROM planner_items WHERE user_id=? AND parent_id=?", nia.id, parcel.id))!.n, 1);
});
