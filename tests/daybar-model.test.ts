// Daybar's planner model (lib/daybar/model.ts): what a day holds, the Tasks
// page's groups, the right panel's scopes, the Inbox and moving items.
// "Today" is Thursday, 26 November 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, blankItem, eventOnDay, inInbox, isDay, isOverdue, isoWeek, itemsOnDay, movedToDay, scopeItems, subtaskProgress, taskGroups, taskInPeriod, upcomingDays, type PlannerItem } from "../lib/daybar/model";

const TODAY = "2026-11-26";
let n = 0;
const item = (over: Partial<PlannerItem>): PlannerItem => ({ ...blankItem(over.kind ?? "task", 1000 + n++), id: `i${n}`, ...over });

test("days: valid dates only, months clamp, ISO weeks", () => {
  assert.equal(isDay("2026-02-29"), false);
  assert.equal(isDay("2028-02-29"), true);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek(TODAY), 48);
});

test("the Tasks page's groups: Inbox, Overdue, days, weeks, months, Waiting, Someday, Done", () => {
  const list = [
    item({ title: "inbox" }),
    item({ title: "filed", folderId: "f" }),
    item({ title: "late", day: "2026-11-24" }),
    item({ title: "later", day: "2026-11-27", time: "09:00" }),
    item({ title: "today b", day: TODAY, priority: 1 }),
    item({ title: "today a", day: TODAY, priority: 3 }),
    item({ title: "week", period: "week", day: "2026-11-30" }),
    item({ title: "month", period: "month", day: "2026-12-01" }),
    item({ title: "waiting", day: "2026-11-20", waitingUntil: "2026-12-02" }),
    item({ title: "back", waitingUntil: "2026-11-25", followUps: 1 }),
    item({ title: "someday", period: "someday" }),
    item({ title: "done", day: "2026-11-20", doneAt: 5, doneDay: "2026-11-25" }),
    item({ title: "sub", parentId: "x", day: TODAY }),
    item({ kind: "event", title: "event", day: TODAY }),
  ];
  const groups = taskGroups(list, TODAY);
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((i) => i.title)]),
    [
      ["inbox", ["inbox"]],
      ["overdue", ["late", "back"]],
      [`day:${TODAY}`, ["today a", "today b"]],
      ["day:2026-11-27", ["later"]],
      ["week:2026-11-30", ["week"]],
      ["month:2026-12-01", ["month"]],
      ["waiting", ["waiting"]],
      ["someday", ["filed", "someday"]],
      ["done", ["done"]],
    ],
  );
  assert.equal(taskGroups(list, TODAY, { doneSince: TODAY }).some((g) => g.kind === "done"), false);
});

test("a day's items: events over several days, tasks, notes and due habits", () => {
  const trip = item({ kind: "event", title: "Trip", day: "2026-11-25", endDay: "2026-11-27", allDay: true });
  const night = item({ kind: "event", title: "Party", day: TODAY, time: "20:00", endDay: "2026-11-27", endTime: "00:00" });
  assert.deepEqual(["2026-11-24", "2026-11-25", TODAY, "2026-11-27", "2026-11-28"].map((d) => eventOnDay(trip, d)), [false, true, true, true, false]);
  assert.equal(eventOnDay(night, "2026-11-27"), false);
  const habit = item({ kind: "habit", title: "Walk", day: "2026-11-01" });
  const on = itemsOnDay([trip, night, item({ title: "Task", day: TODAY }), item({ kind: "note", title: "Note", day: TODAY }), habit], TODAY, TODAY, () => true);
  assert.deepEqual([on.events.map((e) => e.title), on.tasks.length, on.notes.length, on.habits.length], [["Trip", "Party"], 1, 1, 1]);
  assert.equal(taskInPeriod(item({ period: "week", day: "2026-11-23" }), "2026-11-29", 1), true);
  assert.equal(taskInPeriod(item({ period: "week", day: "2026-11-23" }), "2026-11-30", 1), false);
  assert.equal(taskInPeriod(item({ period: "month", day: "2026-11-01" }), "2026-11-30", 1), true);
});

test("Inbox, overdue, scopes and Upcoming", () => {
  const inbox = item({ title: "loose" });
  const late = item({ title: "late", day: "2026-11-20" });
  const waiting = item({ title: "waiting", waitingUntil: "2026-12-01" });
  const next = item({ title: "next", day: "2026-11-28" });
  const event = item({ kind: "event", title: "talk", day: "2026-11-29", time: "10:00" });
  const note = item({ kind: "note", title: "jot" });
  const all = [inbox, late, waiting, next, event, note];
  assert.deepEqual([inInbox(inbox), inInbox(note), inInbox(late), inInbox(waiting)], [true, true, false, false]);
  assert.deepEqual([isOverdue(late, TODAY), isOverdue(waiting, TODAY)], [true, false]);
  assert.deepEqual(scopeItems(all, "inbox", TODAY).map((i) => i.title), ["loose", "jot"]);
  assert.deepEqual(scopeItems(all, "overdue", TODAY).map((i) => i.title), ["late"]);
  assert.deepEqual(scopeItems(all, "waiting", TODAY).map((i) => i.title), ["waiting"]);
  assert.deepEqual(scopeItems(all, "upcoming", TODAY).map((i) => i.title), ["next", "talk"]);
  assert.deepEqual(scopeItems(all, "calendar", TODAY).map((i) => i.title).sort(), ["loose"]);
  const days = upcomingDays(all, TODAY, 30);
  assert.equal(days.length, 30);
  assert.deepEqual(days[2].items.map((i) => i.title), ["next"]);
});

test("moving to another day keeps the time and an event's length; subtask progress", () => {
  const event = item({ kind: "event", day: "2026-11-26", time: "22:00", endDay: "2026-11-27", endTime: "01:00" });
  assert.deepEqual(movedToDay(event, "2026-12-01"), { day: "2026-12-01", endDay: "2026-12-02" });
  const task = item({ day: "2026-11-20", time: "08:00", waitingUntil: "2026-12-05" });
  assert.deepEqual(movedToDay(task, "2026-11-30"), { day: "2026-11-30", period: null, waitingUntil: null });
  const parent = item({ title: "parent" });
  const list = [parent, item({ parentId: parent.id, doneAt: 1 }), item({ parentId: parent.id }), item({ parentId: parent.id, deletedAt: 1 })];
  assert.deepEqual(subtaskProgress(list, parent.id), { done: 1, total: 2 });
});
