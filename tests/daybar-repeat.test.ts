// Daybar habits (lib/daybar/repeat.ts): when a rule makes a habit due, the
// on-time streak, the best streak, the month's rate and the 7-day strip.
// "Today" is Thursday, 26 November 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY, bestStreak, dueByRule, habitDue, habitFinished, monthRate, nextDue, repeatRuleSchema, ruleFromRhythm, ruleLabel, streak, weekStrip, type RepeatRule } from "../lib/daybar/repeat";
import { addDays } from "../lib/daybar/model";

const TODAY = "2026-11-26";
const rule = (r: Partial<RepeatRule>): RepeatRule => ({ ...DAILY, ...r });
const due = (r: Partial<RepeatRule>, start: string, days: string[]) => days.filter((d) => dueByRule(rule(r), start, d));
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const t = (_de: string, en: string) => en;
const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

test("every N days, from the first day on", () => {
  assert.deepEqual(due({ every: 3 }, "2026-11-20", range("2026-11-18", 10)), ["2026-11-20", "2026-11-23", "2026-11-26"]);
  assert.equal(dueByRule(DAILY, "2026-11-20", "2026-11-19"), false);
});

test("weekly: chosen weekdays, or the first day's; every other week counts weeks", () => {
  // Mon, Wed, Fri.
  assert.deepEqual(due({ unit: "week", weekdays: [1, 3, 5] }, "2026-11-23", range("2026-11-23", 7)), ["2026-11-23", "2026-11-25", "2026-11-27"]);
  // No weekday chosen: the start's (Tuesday).
  assert.deepEqual(due({ unit: "week" }, "2026-11-24", range("2026-11-23", 14)), ["2026-11-24", "2026-12-01"]);
  // Every 2 weeks on Monday, started on Wednesday 25 Nov: the week of the start counts.
  assert.deepEqual(due({ unit: "week", every: 2, weekdays: [1] }, "2026-11-25", range("2026-11-23", 35)), ["2026-12-07", "2026-12-21"]);
  // A week starting on Sunday shifts which weeks count.
  assert.equal(dueByRule(rule({ unit: "week", every: 2, weekdays: [0] }), "2026-11-23", "2026-11-29", 1), true);
  assert.equal(dueByRule(rule({ unit: "week", every: 2, weekdays: [0] }), "2026-11-23", "2026-11-29", 0), false);
});

test("monthly on a day; short months fall on their last day", () => {
  assert.deepEqual(due({ unit: "month" }, "2026-01-31", ["2026-02-28", "2026-03-31", "2026-04-30", "2026-04-29"]), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(due({ unit: "month", monthDay: 15, every: 2 }, "2026-01-10", ["2026-01-15", "2026-02-15", "2026-03-15"]), ["2026-01-15", "2026-03-15"]);
});

test("yearly on the first day's date; 29 February on the 28th in other years", () => {
  assert.deepEqual(due({ unit: "year" }, "2024-02-29", ["2025-02-28", "2025-03-01", "2028-02-29", "2028-02-28"]), ["2025-02-28", "2028-02-29"]);
  assert.equal(dueByRule(rule({ unit: "year", every: 2 }), "2024-03-01", "2025-03-01"), false);
});

test("ends on a date, or after N check-ins", () => {
  assert.equal(dueByRule(rule({ ends: { kind: "on", date: "2026-11-25" } }), "2026-11-20", "2026-11-26"), false);
  const habit = { day: "2026-11-20", repeat: rule({ ends: { kind: "after", count: 2 } }) };
  const two = new Map([
    ["2026-11-20", true],
    ["2026-11-21", true],
  ]);
  assert.equal(habitDue(habit, "2026-11-21", two), true);
  assert.equal(habitDue(habit, "2026-11-22", two), false);
  assert.equal(habitFinished(habit, two), true);
  assert.equal(habitFinished(habit, new Map([["2026-11-20", true]])), false);
});

test("the streak counts on-time check-ins; today open does not break it, a late one does", () => {
  const habit = { day: "2026-11-01", repeat: DAILY };
  const log = new Map(range("2026-11-20", 6).map((d) => [d, true]));
  assert.equal(streak(habit, log, TODAY), 6);
  assert.equal(streak(habit, new Map([...log, [TODAY, true]]), TODAY), 7);
  // Logged afterwards: not on time.
  assert.equal(streak(habit, new Map([...log, ["2026-11-23", false]]), TODAY), 2);
  // A missed day ends it.
  const missed = new Map(log);
  missed.delete("2026-11-22");
  assert.equal(streak(habit, missed, TODAY), 3);
  // Days the habit is not due do not count either way.
  const weekly = { day: "2026-11-02", repeat: rule({ unit: "week", weekdays: [1, 4] }) };
  const mondaysThursdays = new Map(["2026-11-16", "2026-11-19", "2026-11-23"].map((d) => [d, true]));
  assert.equal(streak(weekly, mondaysThursdays, TODAY), 3);
  assert.equal(streak(weekly, new Map([...mondaysThursdays, [TODAY, true]]), TODAY), 4);
});

test("best streak, the month's rate and the 7-day strip", () => {
  const habit = { day: "2026-11-01", repeat: DAILY };
  const log = new Map<string, boolean>([...range("2026-11-02", 5).map((d): [string, boolean] => [d, true]), ["2026-11-10", true], ["2026-11-24", false], ["2026-11-25", true]]);
  assert.equal(bestStreak(habit, log, TODAY), 5);
  // 1–25 November due (today not checked in): 25 days, 8 checked in.
  assert.deepEqual(monthRate(habit, log, TODAY), { due: 25, done: 8, rate: 8 / 25 });
  assert.deepEqual(
    weekStrip(habit, log, TODAY).map((s) => s.state),
    ["missed", "missed", "missed", "missed", "late", "done", "open"],
  );
  const weekly = { day: "2026-11-02", repeat: rule({ unit: "week", weekdays: [1] }) };
  assert.deepEqual(weekStrip(weekly, new Map(), TODAY).map((s) => s.state), ["off", "off", "off", "missed", "off", "off", "off"]);
  assert.equal(nextDue(weekly, TODAY), "2026-11-30");
});

test("rules: Quick Add's rhythm, validation and the label", () => {
  assert.deepEqual(ruleFromRhythm({ every: 1, unit: "week", weekdays: [5, 1, 3] }).weekdays, [1, 3, 5]);
  assert.deepEqual(repeatRuleSchema.parse({ every: 2, unit: "day", weekdays: [1] }).weekdays, []);
  assert.throws(() => repeatRuleSchema.parse({ every: 0, unit: "day" }));
  assert.throws(() => repeatRuleSchema.parse({ every: 100, unit: "day" }));
  assert.throws(() => repeatRuleSchema.parse({ every: 1, unit: "day", ends: { kind: "on", date: "2026-02-30" } }));
  const label = (r: Partial<RepeatRule>) => ruleLabel(rule(r), t, (n) => names[n]);
  assert.equal(label({}), "Every day");
  assert.equal(label({ unit: "week", weekdays: [1, 2, 3, 4, 5] }), "Weekdays");
  assert.equal(label({ unit: "week", weekdays: [5, 1] }), "Mon, Fri");
  assert.equal(label({ unit: "week", every: 2, weekdays: [0] }), "Every 2 weeks · Sun");
  assert.equal(label({ unit: "month", monthDay: 15, ends: { kind: "after", count: 6 } }), "Every month · on day 15 · 6 times");
});
