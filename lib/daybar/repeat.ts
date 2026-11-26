// Habits: when a repeat rule makes a habit due, and what its check-ins add
// up to – the on-time streak, the best streak, the month's rate and the
// last seven days. Pure functions on YYYY-MM-DD strings.
//
// The rule: every N days, weeks, months or years (1–99); weekly on chosen
// weekdays (none chosen: the first day's weekday); monthly on a day of the
// month (none: the first day's), a short month falling on its last day;
// yearly on the first day's date (29 February on the 28th in other years).
// It ends never, on a date, or after N check-ins.
import { z } from "zod";
import type { QuickRhythm } from "./quick-add";
import { addDays, daysInMonth, diffDays, isDay, weekStart, weekdayOf } from "./model";

export type RepeatUnit = "day" | "week" | "month" | "year";
export type RepeatEnds = { kind: "never" } | { kind: "on"; date: string } | { kind: "after"; count: number };
export type RepeatRule = {
  every: number;
  unit: RepeatUnit;
  // 0 = Sunday … 6 = Saturday.
  weekdays: number[];
  monthDay: number | null;
  ends: RepeatEnds;
  // A reminder at this time on due days (HH:MM).
  remind: string | null;
};
export const DAILY: RepeatRule = { every: 1, unit: "day", weekdays: [], monthDay: null, ends: { kind: "never" }, remind: null };

const day = z.string().refine(isDay, "Ungültiges Datum.");
export const repeatRuleSchema = z
  .object({
    every: z.number().int().min(1).max(99),
    unit: z.enum(["day", "week", "month", "year"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    monthDay: z.number().int().min(1).max(31).nullable().default(null),
    ends: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("never") }),
        z.object({ kind: z.literal("on"), date: day }),
        z.object({ kind: z.literal("after"), count: z.number().int().min(1).max(9999) }),
      ])
      .default({ kind: "never" }),
    remind: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
  })
  .transform((rule) => ({ ...rule, weekdays: rule.unit === "week" ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [] }));

// Quick Add's rhythm ("every mon, wed and fri", "every 2 weeks") as a rule.
export const ruleFromRhythm = (r: QuickRhythm): RepeatRule => ({ ...DAILY, every: r.every, unit: r.unit, weekdays: r.unit === "week" ? [...r.weekdays].sort((a, b) => a - b) : [] });

const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
// Whether the rule makes the habit due on `d` (ignoring "after N").
export function dueByRule(rule: RepeatRule, start: string, d: string, weekStartsOn: 0 | 1 = 1): boolean {
  if (d < start) return false;
  if (rule.ends.kind === "on" && d > rule.ends.date) return false;
  const every = Math.max(1, rule.every);
  switch (rule.unit) {
    case "day":
      return diffDays(start, d) % every === 0;
    case "week": {
      const weeks = Math.round(diffDays(weekStart(start, weekStartsOn), weekStart(d, weekStartsOn)) / 7);
      if (weeks % every) return false;
      return rule.weekdays.length ? rule.weekdays.includes(weekdayOf(d)) : weekdayOf(d) === weekdayOf(start);
    }
    case "month": {
      if ((monthIndex(d) - monthIndex(start)) % every) return false;
      const wanted = rule.monthDay ?? Number(start.slice(8, 10));
      return Number(d.slice(8, 10)) === Math.min(wanted, daysInMonth(d));
    }
    case "year": {
      if ((Number(d.slice(0, 4)) - Number(start.slice(0, 4))) % every || d.slice(5, 7) !== start.slice(5, 7)) return false;
      return Number(d.slice(8, 10)) === Math.min(Number(start.slice(8, 10)), daysInMonth(d));
    }
  }
}

export type Habit = { day: string | null; repeat: RepeatRule | null; createdAt?: number };
export type Checkins = ReadonlyMap<string, boolean>; // day → on time

// Due on `d`: by the rule, and – with "after N" – not after the Nth check-in.
export function habitDue(habit: Habit, d: string, checkins: Checkins = new Map(), weekStartsOn: 0 | 1 = 1): boolean {
  if (!habit.day) return false;
  const rule = habit.repeat ?? DAILY;
  if (!dueByRule(rule, habit.day, d, weekStartsOn)) return false;
  if (rule.ends.kind === "after") {
    const before = [...checkins.keys()].filter((k) => k < d).length;
    if (before >= rule.ends.count) return false;
  }
  return true;
}
// Done for good: "after N" reached.
export function habitFinished(habit: Habit, checkins: Checkins) {
  const rule = habit.repeat ?? DAILY;
  return rule.ends.kind === "after" && checkins.size >= rule.ends.count;
}

// The on-time streak as of `today`: due days, newest first, each checked
// in on time. Today counts once checked in; not yet checked in, it does
// not break the streak (the day is not over). A late check-in ends it.
export function streak(habit: Habit, checkins: Checkins, today: string, weekStartsOn: 0 | 1 = 1, limit = 800): number {
  if (!habit.day) return 0;
  let n = 0;
  for (let d = today, i = 0; d >= habit.day && i < limit; d = addDays(d, -1), i++) {
    if (!habitDue(habit, d, checkins, weekStartsOn)) continue;
    const onTime = checkins.get(d);
    if (onTime) n++;
    else if (d === today && onTime === undefined) continue;
    else break;
  }
  return n;
}
// The longest run of on-time check-ins on due days, up to today.
export function bestStreak(habit: Habit, checkins: Checkins, today: string, weekStartsOn: 0 | 1 = 1, limit = 1500): number {
  if (!habit.day) return 0;
  let best = 0,
    run = 0;
  const from = diffDays(habit.day, today) > limit ? addDays(today, -limit) : habit.day;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (!habitDue(habit, d, checkins, weekStartsOn)) continue;
    if (checkins.get(d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return best;
}
// The month of `today` so far: due days and those checked in (late ones
// count). Today counts only once checked in.
export function monthRate(habit: Habit, checkins: Checkins, today: string, weekStartsOn: 0 | 1 = 1) {
  let due = 0,
    done = 0;
  for (let d = `${today.slice(0, 7)}-01`; d <= today; d = addDays(d, 1)) {
    if (!habitDue(habit, d, checkins, weekStartsOn)) continue;
    const checked = checkins.has(d);
    if (d === today && !checked) continue;
    due++;
    if (checked) done++;
  }
  return { due, done, rate: due ? done / due : null };
}
export type StripDay = { day: string; state: "done" | "late" | "missed" | "open" | "off" };
// The last seven days, oldest first.
export function weekStrip(habit: Habit, checkins: Checkins, today: string, weekStartsOn: 0 | 1 = 1): StripDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const onTime = checkins.get(d);
    if (onTime !== undefined) return { day: d, state: onTime ? "done" : "late" };
    if (!habitDue(habit, d, checkins, weekStartsOn)) return { day: d, state: "off" };
    return { day: d, state: d === today ? "open" : "missed" };
  });
}
// The first day on or after `from` the habit is due (the first day a new
// weekly habit starts on), within a year.
export function nextDue(habit: Habit, from: string, checkins: Checkins = new Map(), weekStartsOn: 0 | 1 = 1): string | null {
  for (let d = from, i = 0; i < 400; d = addDays(d, 1), i++) if (habitDue(habit, d, checkins, weekStartsOn)) return d;
  return null;
}

// How a rule reads, in the reader's language (t from components/i18n).
type T = (de: string, en: string) => string;
export function ruleLabel(rule: RepeatRule, t: T, weekdayName: (n: number) => string, weekStartsOn: 0 | 1 = 1): string {
  const list = rule.weekdays.join();
  const sorted = [...rule.weekdays].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7));
  const days = !rule.weekdays.length ? "" : list === "1,2,3,4,5" ? t("Werktags", "Weekdays") : list === "0,6" ? t("Am Wochenende", "Weekends") : sorted.map(weekdayName).join(", ");
  let text: string;
  if (rule.unit === "week" && days) text = rule.every === 1 ? days : t(`Alle ${rule.every} Wochen · ${days}`, `Every ${rule.every} weeks · ${days}`);
  else if (rule.every === 1)
    text = { day: t("Jeden Tag", "Every day"), week: t("Jede Woche", "Every week"), month: t("Jeden Monat", "Every month"), year: t("Jedes Jahr", "Every year") }[rule.unit];
  else
    text = {
      day: t(`Alle ${rule.every} Tage`, `Every ${rule.every} days`),
      week: t(`Alle ${rule.every} Wochen`, `Every ${rule.every} weeks`),
      month: t(`Alle ${rule.every} Monate`, `Every ${rule.every} months`),
      year: t(`Alle ${rule.every} Jahre`, `Every ${rule.every} years`),
    }[rule.unit];
  if (rule.unit === "month" && rule.monthDay) text += t(` · am ${rule.monthDay}.`, ` · on day ${rule.monthDay}`);
  if (rule.ends.kind === "on") text += t(` · bis ${rule.ends.date}`, ` · until ${rule.ends.date}`);
  if (rule.ends.kind === "after") text += t(` · ${rule.ends.count}-mal`, ` · ${rule.ends.count} times`);
  return text;
}
