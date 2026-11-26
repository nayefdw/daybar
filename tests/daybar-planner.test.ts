// Daybar's planner on the server (lib/daybar/store.ts): the person's own
// items, folders, tags, check-ins and settings per workspace; nobody else
// reads or changes them; notes are documents in the private space; day
// notes are journal days.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Identity, Page } from "../lib/types";

process.env.FLOWPLAN_DATA_DIR = mkdtempSync(join(tmpdir(), "flowplan-daybar-planner-"));
const { id, run, one, all } = await import("../lib/db");
const { createWorkspace } = await import("../lib/seed");
const { plannerCommand, plannerState, dayNoteTexts, htmlLines } = await import("../lib/daybar/store");

async function account(name: string): Promise<Identity> {
  const uid = id();
  await run("INSERT INTO users(id,subject,name,email) VALUES(?,?,?,?)", uid, uid, name, `${name}@test.invalid`);
  return { id: uid, name, email: `${name}@test.invalid`, groups: [], isAdmin: false, disabled: 0, created_at: "" } as Identity;
}
const anna = await account("Anna"),
  ben = await account("Ben"),
  stranger = await account("Sam");
const wid = await createWorkspace(anna.id, "Home");
await run("INSERT INTO members VALUES(?,?,?)", wid, ben.id, "viewer");
const TODAY = "2026-11-26";
const act = async (body: Record<string, unknown>, as = anna): Promise<any> => await plannerCommand(as, { workspaceId: wid, today: TODAY, ...body });
const create = async (item: Record<string, unknown>, as = anna) => await act({ action: "item.create", item }, as);
const state = async (as = anna): Promise<any> => await plannerState(as, wid, TODAY);

test("a task, an event and a habit, shaped by their kind", async () => {
  const task = await create({ kind: "task", title: "Pay rent", day: "2026-12-01", time: "09:00", priority: 3, tags: ["home", "#money"] });
  assert.deepEqual([task.kind, task.day, task.time, task.priority, task.tags.length], ["task", "2026-12-01", "09:00", 3, 2]);
  // A period: the week's first day, no time; someday: no day.
  const week = await create({ kind: "task", title: "Plan party", period: "week", day: "2026-11-26", time: "10:00" });
  assert.deepEqual([week.day, week.time, week.period], ["2026-11-23", null, "week"]);
  const month = await create({ kind: "task", title: "Renew passport", period: "month", day: "2026-12-17" });
  assert.equal(month.day, "2026-12-01");
  const someday = await create({ kind: "task", title: "Read a book", period: "someday", day: "2026-12-01" });
  assert.equal(someday.day, null);
  // An event: an hour by default, all-day without a time, never before it starts.
  const event = await create({ kind: "event", title: "Dentist", day: "2026-11-27", time: "14:00" });
  assert.deepEqual([event.endDay, event.endTime, event.allDay], ["2026-11-27", "15:00", false]);
  const late = await create({ kind: "event", title: "Night train", day: "2026-11-27", time: "23:30", endTime: "01:00", endDay: "2026-11-28" });
  assert.deepEqual([late.endDay, late.endTime], ["2026-11-28", "01:00"]);
  const backwards = await create({ kind: "event", title: "Oops", day: "2026-11-27", time: "14:00", endTime: "13:00" });
  assert.deepEqual([backwards.endDay, backwards.endTime], ["2026-11-27", "15:00"]);
  const allDay = await create({ kind: "event", title: "Mia's birthday", day: "2027-03-14" });
  assert.deepEqual([allDay.allDay, allDay.time, allDay.priority], [true, null, 0]);
  // A habit: daily from today unless told otherwise.
  const habit = await create({ kind: "habit", title: "Walk" });
  assert.deepEqual([habit.day, habit.repeat.unit, habit.repeat.every], [TODAY, "day", 1]);
  await assert.rejects(create({ kind: "task", title: "  " }), /Titel/);
  await assert.rejects(create({ kind: "task", title: "x", day: "2026-02-30" }));
  await assert.rejects(create({ kind: "task", title: "x", link: "javascript:alert(1)" }));
  const s = await state();
  assert.deepEqual(s.tags.map((t: { name: string }) => t.name).sort(), ["home", "money"]);
  assert.ok(s.items.some((i: { id: string }) => i.id === task.id));
});

test("only the person's own planner: others neither read nor change it", async () => {
  const mine = await create({ kind: "task", title: "Private plan" });
  assert.equal((await state(ben)).items.some((i: { id: string }) => i.id === mine.id), false);
  await assert.rejects(act({ action: "item.update", id: mine.id, patch: { title: "Hijacked" } }, ben), /nicht gefunden/);
  await assert.rejects(act({ action: "item.delete", id: mine.id }, ben), /nicht gefunden/);
  await assert.rejects(act({ action: "item.done", id: mine.id, done: true }, ben), /nicht gefunden/);
  // Not a member: no planner in this workspace at all.
  await assert.rejects(plannerState(stranger, wid, TODAY), /Berechtigung/);
  await assert.rejects(act({ action: "item.create", item: { kind: "task", title: "x" } }, stranger), /Berechtigung/);
  // A read-only API token reads but never writes.
  await assert.rejects(act({ action: "item.create", item: { kind: "task", title: "x" } }, { ...anna, apiScope: "read" }), /nur lesen/);
  // Another person's folder or parent cannot be used.
  const folder = await act({ action: "folder.create", folder: { name: "Work" } });
  await assert.rejects(create({ kind: "task", title: "x", folderId: folder.id }, ben), /Ordner/);
  await assert.rejects(create({ kind: "task", title: "x", parentId: mine.id }, ben), /Aufgabe nicht gefunden/);
  assert.equal((await one<{ title: string }>("SELECT title FROM planner_items WHERE id=?", mine.id))?.title, "Private plan");
});

test("done, subtasks, waiting with follow-ups, trash and back", async () => {
  const task = await create({ kind: "task", title: "Move flat", day: TODAY });
  const one1 = await create({ kind: "task", title: "Boxes", parentId: task.id });
  const one2 = await create({ kind: "task", title: "Van", parentId: task.id });
  await create({ kind: "task", title: "Tape", parentId: one1.id });
  await assert.rejects(create({ kind: "event", title: "x", parentId: task.id }), /Unteraufgaben/);
  await assert.rejects(act({ action: "item.update", id: task.id, patch: { parentId: one1.id } }), /unter sich selbst/);
  const done = await act({ action: "item.done", id: one2.id, done: true });
  assert.equal(done.doneDay, TODAY);
  assert.ok(done.doneAt > 0);
  // Waiting: each new wait counts a follow-up.
  const waiting = await act({ action: "item.update", id: task.id, patch: { waitingUntil: "2026-12-03" } });
  assert.equal(waiting.followUps, 1);
  assert.equal((await act({ action: "item.update", id: task.id, patch: { waitingUntil: "2026-12-10" } })).followUps, 2);
  // Into the trash with the subtasks, and back.
  const removed = await act({ action: "item.delete", id: task.id });
  assert.equal(removed.ids.length, 4);
  const after = await state();
  assert.equal(after.items.some((i: { id: string }) => i.id === task.id || i.id === one1.id), false);
  await act({ action: "item.restore", id: task.id });
  assert.equal((await state()).items.filter((i: { parentId: string | null }) => i.parentId === task.id).length, 2);
});

test("bulk moves keep times; items move between kinds but notes stay notes", async () => {
  const a = await create({ kind: "task", title: "Leftover A", day: "2026-11-25", time: "08:30" });
  const b = await create({ kind: "task", title: "Leftover B", day: "2026-11-24" });
  const moved = await act({ action: "items.update", ids: [a.id, b.id], patch: { day: TODAY } });
  assert.deepEqual(moved.map((i: { day: string; time: string | null }) => [i.day, i.time]), [[TODAY, "08:30"], [TODAY, null]]);
  const event = await act({ action: "item.update", id: a.id, patch: { kind: "event" } });
  assert.deepEqual([event.kind, event.endTime], ["event", "09:30"]);
});

test("habits: check-ins on time and afterwards, never ahead", async () => {
  const habit = await create({ kind: "habit", title: "Stretch", day: "2026-11-20", repeat: { every: 1, unit: "week", weekdays: [1, 4] } });
  assert.deepEqual(habit.repeat.weekdays, [1, 4]);
  assert.equal((await act({ action: "habit.check", id: habit.id, day: TODAY, done: true })).onTime, true);
  assert.equal((await act({ action: "habit.check", id: habit.id, day: "2026-11-23", done: true })).onTime, false);
  await assert.rejects(act({ action: "habit.check", id: habit.id, day: "2026-11-27", done: true }), /künftiger Tag/);
  await assert.rejects(act({ action: "item.done", id: habit.id, done: true }), /abgehakt/);
  const logs = (await state()).logs.filter((l: { itemId: string }) => l.itemId === habit.id);
  assert.deepEqual(logs.map((l: { day: string; onTime: boolean }) => [l.day, l.onTime]), [["2026-11-23", false], [TODAY, true]]);
  await act({ action: "habit.check", id: habit.id, day: "2026-11-23", done: false });
  assert.equal((await state()).logs.filter((l: { itemId: string }) => l.itemId === habit.id).length, 1);
});

test("folders and tags: renamed, deleted (items keep going), unique tag names", async () => {
  const folder = await act({ action: "folder.create", folder: { name: "Trips", color: "teal" } });
  const item = await create({ kind: "task", title: "Pack", folderId: folder.id, tags: ["Travel"] });
  const renamed = await act({ action: "folder.update", id: folder.id, patch: { name: "Holidays" } });
  assert.equal(renamed.name, "Holidays");
  await act({ action: "folder.delete", id: folder.id });
  assert.equal((await state()).items.find((i: { id: string }) => i.id === item.id).folderId, null);
  const tag = (await state()).tags.find((t: { name: string }) => t.name === "Travel");
  // "#travel" again is the same tag.
  const again = await create({ kind: "task", title: "Book", tags: ["travel"] });
  assert.deepEqual(again.tags, [tag.id]);
  const other = await act({ action: "tag.create", tag: { name: "Errands" } });
  await assert.rejects(act({ action: "tag.update", id: other.id, patch: { name: "TRAVEL" } }), /gibt es schon/);
  await act({ action: "tag.delete", id: tag.id });
  assert.deepEqual((await state()).items.find((i: { id: string }) => i.id === again.id).tags, []);
});

test("settings: the week start and the calendar, checked", async () => {
  const next = await act({ action: "settings.update", patch: { weekStart: 0, calendarView: "days", calendarDays: 4 } });
  assert.deepEqual([next.weekStart, next.calendarView, next.calendarDays], [0, "days", 4]);
  // A week period now starts on Sunday.
  assert.equal((await create({ kind: "task", title: "Sunday week", period: "week", day: TODAY })).day, "2026-11-22");
  await assert.rejects(act({ action: "settings.update", patch: { workStart: 18, workEnd: 9 } }), /Arbeitszeit/);
  await assert.rejects(act({ action: "settings.update", patch: { thisday: { sent: [] } } }));
  await act({ action: "settings.update", patch: { weekStart: 1 } });
});

test("notes are documents in the private space; their title is the page's", async () => {
  const note = await create({ kind: "note", title: "Packing list", day: TODAY, tags: ["travel"] });
  assert.ok(note.pageId);
  const page = (await one<Page>("SELECT * FROM pages WHERE id=?", note.pageId))!;
  assert.equal(page.title, "Packing list");
  const parent = (await one<Page>("SELECT * FROM pages WHERE id=?", page.parent_id))!;
  assert.equal(parent.title, "Notizen");
  const space = (await one<{ visibility: string; owner_id: string }>("SELECT visibility,owner_id FROM spaces WHERE id=?", page.space_id))!;
  assert.deepEqual(space, { visibility: "private", owner_id: anna.id });
  // Renamed in the planner: the page too; renamed as a page: the planner shows it.
  await act({ action: "item.update", id: note.id, patch: { title: "Packing" } });
  assert.equal((await one<Page>("SELECT title FROM pages WHERE id=?", note.pageId))!.title, "Packing");
  await run("UPDATE pages SET title=? WHERE id=?", "Packing (final)", note.pageId);
  assert.equal((await state()).items.find((i: { id: string }) => i.id === note.id).title, "Packing (final)");
  // A second note goes below the same page.
  const second = await create({ kind: "note", title: "Ideas" });
  assert.equal((await one<Page>("SELECT parent_id FROM pages WHERE id=?", second.pageId))!.parent_id, page.parent_id);
  await assert.rejects(act({ action: "item.update", id: note.id, patch: { kind: "task" } }), /Notizen/);
  // Deleted in the planner: the page goes to the trash, and comes back.
  await act({ action: "item.delete", id: note.id });
  assert.ok((await one<Page>("SELECT deleted_at FROM pages WHERE id=?", note.pageId))!.deleted_at);
  await act({ action: "item.restore", id: note.id });
  assert.equal((await one<Page>("SELECT deleted_at FROM pages WHERE id=?", note.pageId))!.deleted_at, null);
  // A reader of the workspace has no private space for notes.
  await assert.rejects(create({ kind: "note", title: "No" }, ben), /Berechtigung/);
});

test("day notes are the days of a journal in the private space", async () => {
  const day = await act({ action: "dayNote.open", day: TODAY });
  assert.ok(day.journalId);
  const journal = (await one<Page>("SELECT * FROM pages WHERE id=?", day.journalId))!;
  assert.equal(journal.kind, "journal");
  // The same journal next time; a later day is not made yet.
  assert.equal((await act({ action: "dayNote.open", day: "2026-11-25" })).journalId, day.journalId);
  assert.equal((await act({ action: "dayNote.open", day: "2026-12-24" })).dayId, null);
  const past = await act({ action: "dayNote.open", day: "2026-11-25" });
  assert.ok(past.dayId);
  await run("UPDATE documents SET html=? WHERE page_id=?", "<p>Slept well.</p><ul><li><p>Call &amp; plan</p></li></ul>", past.dayId);
  const texts = await dayNoteTexts(anna, wid, "2026-11-20", TODAY);
  assert.equal(texts["2026-11-25"].text, "Slept well.\nCall & plan");
  assert.equal(htmlLines("<h2>A</h2><p>B<br>C</p>"), "A\nB\nC");
});

test("the person's planner goes with their account and moves with a merge", async () => {
  const gone = await account("Gone");
  const own = await createWorkspace(gone.id, "Solo");
  await plannerCommand(gone, { action: "item.create", workspaceId: own, today: TODAY, item: { kind: "task", title: "Mine", tags: ["x"] } });
  await plannerCommand(gone, { action: "settings.update", workspaceId: own, today: TODAY, patch: { weekStart: 0 } });
  assert.equal((await all("SELECT id FROM planner_items WHERE user_id=?", gone.id)).length, 1);
  const { USER_REFERENCES } = await import("../lib/account-merge");
  for (const key of ["planner_items.user_id", "planner_folders.user_id", "planner_tags.user_id", "planner_settings.user_id"]) assert.equal(USER_REFERENCES[key], "move", key);
});
