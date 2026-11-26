// Daybar Quick Add (lib/daybar/quick-add.ts): the worked examples of the
// planner grammar. "Today" is Tuesday, 24 November 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd, rhythmLabel, type QuickContext } from "../lib/daybar/quick-add";

const ctx: QuickContext = { today: "2026-11-24", locale: "en", folders: ["Trips", "Home", "Work"] };
const parse = (text: string, extra: Partial<QuickContext> = {}) => parseQuickAdd(text, { ...ctx, ...extra });
const pick = (text: string, extra: Partial<QuickContext> = {}) => {
  const r = parse(text, extra);
  return { kind: r.kind, title: r.title, date: r.date, time: r.time };
};

test("a day word makes a dated task", () => {
  assert.deepEqual(pick("Buy milk tomorrow"), { kind: "task", title: "Buy milk", date: "2026-11-25", time: null });
  assert.deepEqual(pick("Dentist friday"), { kind: "task", title: "Dentist", date: "2026-11-27", time: null });
});

test("a time, or a meeting word, makes an event of an hour", () => {
  const r = parse("Dentist friday 14:00");
  assert.deepEqual([r.kind, r.title, r.date, r.time, r.end, r.allDay], ["event", "Dentist", "2026-11-27", "14:00", "15:00", false]);
  const call = parse("Call mom tomorrow 5pm #family");
  assert.deepEqual([call.kind, call.title, call.date, call.time, call.end, call.tags], ["event", "Call mom", "2026-11-25", "17:00", "18:00", ["family"]]);
  assert.equal(parse("Lunch with Anna").kind, "event");
  assert.equal(parse("Lunch with Anna").allDay, true);
});

test("a prefix decides the kind and keeps kind words in the title", () => {
  const r = parse("T: Call mom tomorrow 5pm !! #family");
  assert.deepEqual([r.kind, r.kindFrom, r.title, r.date, r.time, r.priority, r.tags], ["task", "prefix", "Call mom", "2026-11-25", "17:00", 2, ["family"]]);
  assert.deepEqual(pick("T: Write release note"), { kind: "task", title: "Write release note", date: null, time: null });
  assert.deepEqual(pick("Write release note"), { kind: "note", title: "Write release", date: null, time: null });
  const birthday = parse("E: Mia's birthday march 14");
  assert.deepEqual([birthday.kind, birthday.title, birthday.date, birthday.allDay], ["event", "Mia's birthday", "2027-03-14", true]);
});

test("the kind badge wins over everything typed", () => {
  const r = parse("Call mom tomorrow 5pm", { kind: "task" });
  assert.deepEqual([r.kind, r.kindFrom, r.title], ["task", "badge", "Call mom"]);
});

test("command sentences drop their filler words", () => {
  const r = parse("create new event tomorrow 14:00 called Budget review");
  assert.deepEqual([r.kind, r.title, r.date, r.time, r.end], ["event", "Budget review", "2026-11-25", "14:00", "15:00"]);
  assert.deepEqual(pick("add a task for the dentist friday"), { kind: "task", title: "dentist", date: "2026-11-27", time: null });
});

test("notes take tags, an existing folder and the day they belong to", () => {
  const r = parse("N: Packing list #travel $Trips");
  assert.deepEqual([r.kind, r.title, r.tags, r.folder], ["note", "Packing list", ["travel"], "Trips"]);
  const unknown = parse("Ideas $Nowhere");
  assert.deepEqual([unknown.title, unknown.folder], ["Ideas $Nowhere", null]);
});

test("priority marks stand alone", () => {
  const r = parse("Pay rent october 1 !!! #home");
  assert.deepEqual([r.kind, r.title, r.date, r.priority, r.tags], ["task", "Pay rent", "2027-10-01", 3, ["home"]]);
  assert.equal(parse("Fix leak !").priority, 1);
  assert.deepEqual([parse("Fix leak!!!").priority, parse("Fix leak!!!").title], [0, "Fix leak!!!"]);
});

test("periods: someday, weeks and months", () => {
  assert.deepEqual(parse("Read that book someday").period, { kind: "someday" });
  assert.equal(parse("Read that book someday").title, "Read that book");
  assert.deepEqual(parse("Tax return week 15").period, { kind: "week", start: "2027-04-12" });
  assert.deepEqual(parse("Plan party this week").period, { kind: "week", start: "2026-11-23" });
  assert.deepEqual(parse("Plan party this week", { weekStartsOn: 0 }).period, { kind: "week", start: "2026-11-22" });
  assert.deepEqual(parse("Renew passport next month").period, { kind: "month", start: "2026-12-01" });
  assert.deepEqual(parse("Book flights october").period, { kind: "month", start: "2027-10-01" });
  assert.deepEqual(parse("Visit october 2027").period, { kind: "month", start: "2027-10-01" });
  // "may" is a word too: a month only with a year.
  assert.equal(parse("I may call").period, null);
  // An event typed with a period is all-day on its first day.
  const e = parse("E: Conference next week");
  assert.deepEqual([e.date, e.allDay, e.period], ["2026-11-30", true, null]);
});

test("tonight is 8 pm", () => {
  const r = parse("Pick up dry cleaning tonight");
  assert.deepEqual([r.kind, r.date, r.time, r.end], ["event", "2026-11-24", "20:00", "21:00"]);
  const t = parse("T: Pick up dry cleaning tonight");
  assert.deepEqual([t.kind, t.title, t.date, t.time], ["task", "Pick up dry cleaning", "2026-11-24", "20:00"]);
});

test("rhythms make habits that start on their first allowed day", () => {
  const gym = parse("Gym every mon, wed and fri 7:00");
  assert.deepEqual([gym.kind, gym.title, gym.time, gym.date], ["habit", "Gym", "07:00", "2026-11-25"]);
  assert.deepEqual(gym.rhythm, { every: 1, unit: "week", weekdays: [1, 3, 5] });
  const thu = parse("H: Gym every mon and thu");
  assert.deepEqual([thu.date, thu.rhythm?.weekdays], ["2026-11-26", [1, 4]]);
  assert.deepEqual(parse("task water plants every 3 days").rhythm, { every: 3, unit: "day", weekdays: [] });
  assert.equal(parse("task water plants every 3 days").title, "water plants");
  assert.deepEqual(parse("Team sync every other friday").rhythm, { every: 2, unit: "week", weekdays: [5] });
  assert.deepEqual(parse("Stretch every weekday").rhythm, { every: 1, unit: "week", weekdays: [1, 2, 3, 4, 5] });
  assert.deepEqual(parse("Brunch on sundays").rhythm, { every: 1, unit: "week", weekdays: [0] });
  assert.deepEqual(parse("Rent fortnightly").rhythm, { every: 2, unit: "week", weekdays: [] });
  // H: alone repeats daily.
  assert.deepEqual(parse("H: Meditate").rhythm, { every: 1, unit: "day", weekdays: [] });
});

test("rhythm words at the start stay in the title, at the end they go", () => {
  const weekly = parse("Weekly review friday");
  assert.deepEqual([weekly.kind, weekly.title, weekly.date], ["habit", "Weekly review", "2026-11-27"]);
  assert.equal(parse("Review finances monthly").title, "Review finances");
  const swim = parse("Swim weekly oct 1");
  assert.deepEqual([swim.title, swim.date], ["Swim", "2027-10-01"]);
});

test("events and notes never repeat", () => {
  const r = parse("E: Standup every day 9:30");
  assert.deepEqual([r.kind, r.title, r.time, r.rhythm], ["event", "Standup every day", "09:30", null]);
});

test("plural weekdays are a rhythm only after every or on", () => {
  assert.deepEqual(pick("sundays brunch ideas"), { kind: "task", title: "sundays brunch ideas", date: null, time: null });
});

test("at and on before a day go with it", () => {
  const r = parse("Call Anna on friday at 10:00");
  assert.deepEqual([r.kind, r.title, r.date, r.time], ["event", "Call Anna", "2026-11-27", "10:00"]);
  assert.equal(parse("Look at the garden").title, "Look at the garden");
});

test("tags from # and from the word tag", () => {
  assert.deepEqual([parse("Buy paint tag diy").title, parse("Buy paint tag diy").tags], ["Buy paint", ["diy"]]);
  assert.deepEqual(parse("Plan #home #weekend").tags, ["home", "weekend"]);
  assert.deepEqual(parse("Plan #work,").tags, ["work"]);
});

test("a link becomes a saved link", () => {
  const r = parse("Read later https://example.com/article #reading");
  assert.deepEqual([r.kind, r.title, r.link, r.tags], ["task", "Read later", "https://example.com/article", ["reading"]]);
  assert.equal(parse("https://www.example.org/page").title, "example.org");
});

test("durations and the event end", () => {
  assert.equal(parse("T: Write report ~45m").duration, 45);
  assert.equal(parse("T: Write report ~1.5h").duration, 90);
  const e = parse("Workshop friday 9:00 ~2h");
  assert.deepEqual([e.kind, e.time, e.end], ["event", "09:00", "11:00"]);
  const late = parse("Party friday 23:30");
  assert.deepEqual([late.endDate, late.end], ["2026-11-28", "00:30"]);
});

test("other languages through quick capture's day words", () => {
  const r = parse("Zahnarzt morgen 10:00");
  assert.deepEqual([r.kind, r.title, r.date, r.time], ["event", "Zahnarzt", "2026-11-25", "10:00"]);
  assert.equal(parse("Gym @friday").date, "2026-11-27");
});

test("highlight spans cover what was understood", () => {
  const text = "T: Call mom tomorrow 5pm !! #family";
  const roles = parse(text).spans.map((s) => [s.role, text.slice(s.start, s.end).trim()]);
  assert.deepEqual(roles, [["kind", "T:"], ["date", "tomorrow 5pm"], ["priority", "!!"], ["tag", "#family"]]);
});

test("rhythm labels", () => {
  assert.equal(rhythmLabel({ every: 1, unit: "day", weekdays: [] }), "Every day");
  assert.equal(rhythmLabel({ every: 1, unit: "week", weekdays: [1, 3, 5] }), "Mon, Wed, Fri");
  assert.equal(rhythmLabel({ every: 2, unit: "week", weekdays: [5] }), "Every 2 weeks · Fri");
  assert.equal(rhythmLabel({ every: 3, unit: "month", weekdays: [] }), "Every 3 months");
});
