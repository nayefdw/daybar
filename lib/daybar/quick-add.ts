// Daybar Quick Add: one typed sentence becomes a task, event, note or habit
// ("Gym every mon, wed and fri 7:00", "E: Mia's birthday march 14",
// "Pay rent october 1 !!! #home $Home"). The top bar (⌘K), the launcher and
// the capture lines all call parseQuickAdd(), so there is one grammar.
//
// Days and times come from quick capture's tokens() (lib/capture-parse.ts):
// German, English and French day words, "in 3 days", 24.12., 3pm, 15 Uhr.
// This layer adds what a planner needs on top: the kind (prefix, kind word,
// command sentence or a guess), periods (this week, week 45, october,
// someday), repeat rhythms (habits), $folders, ! / !! / !!! priorities,
// ~durations and saved links. Pure functions, no database.
import { tokens } from "../capture-parse";

export type QuickKind = "task" | "event" | "note" | "habit";
export type QuickPeriod = { kind: "week"; start: string } | { kind: "month"; start: string } | { kind: "someday" };
// weekdays: 0 = Sunday … 6 = Saturday; empty = the rhythm alone decides.
export type QuickRhythm = { every: number; unit: "day" | "week" | "month" | "year"; weekdays: number[] };
export type QuickRole = "kind" | "date" | "priority" | "tag" | "folder" | "rhythm" | "duration" | "link";
export type QuickSpan = { start: number; end: number; role: QuickRole };
export type QuickAdd = {
  kind: QuickKind;
  kindFrom: "prefix" | "badge" | "word" | "guess";
  title: string;
  // Task/habit: due (habit: first) day. Event: its day. Note: the day it is pinned to.
  date: string | null;
  time: string | null;
  // Events: the end, the typed ~duration or the default length after the start.
  endDate: string | null;
  end: string | null;
  allDay: boolean;
  period: QuickPeriod | null;
  priority: 0 | 1 | 2 | 3;
  tags: string[];
  folder: string | null;
  rhythm: QuickRhythm | null;
  duration: number | null;
  link: string | null;
  spans: QuickSpan[];
};
export type QuickContext = {
  // The person's today, YYYY-MM-DD.
  today: string;
  locale?: string;
  // Existing folder names: "$name" only files into one of these.
  folders?: readonly string[];
  weekStartsOn?: 0 | 1;
  // Default event length in minutes.
  eventMinutes?: number;
  // The kind badge's choice; wins over everything typed.
  kind?: QuickKind;
};

export const QUICK_ADD_MAX = 2000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(day: string, n: number) {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export const weekdayOf = (day: string) => utc(day).getUTCDay();
export function weekStart(day: string, weekStartsOn: 0 | 1 = 1) {
  return addDays(day, -((weekdayOf(day) - weekStartsOn + 7) % 7));
}
const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`;
// Monday (or the Sunday before it) of ISO week n.
function isoWeekStart(year: number, n: number, weekStartsOn: 0 | 1) {
  const jan4 = `${year}-01-04`;
  const monday = addDays(jan4, -((weekdayOf(jan4) + 6) % 7) + 7 * (n - 1));
  return weekStartsOn === 0 ? addDays(monday, -1) : monday;
}

// ---- Words ----

const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const WEEKDAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};
const WD_NAMES = Object.keys(WEEKDAY).sort((a, b) => b.length - a.length).join("|");
const WD = `(?:${WD_NAMES})s?`;
const WD_PLURAL = `(?:${WD_NAMES})s`;
const wd = (word: string) => WEEKDAY[word.toLowerCase()] ?? WEEKDAY[word.toLowerCase().replace(/s$/, "")];
const MONTH: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  januar: 1, februar: 2, märz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
  janvier: 1, février: 2, mars: 3, avril: 4, juin: 6, juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MON = Object.keys(MONTH).sort((a, b) => b.length - a.length).join("|");
// Month names that are everyday words or names too: a period only with a year.
const WORDLIKE_MONTHS = new Set(["may", "mai", "mar", "jan", "sept", "mars", "marzo", "mayo"]);
const NUMBER: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, other: 2, second: 2, "2nd": 2 };
const EVERY = "(?:every|each|jeden|jede|jedes|chaque|cada)";
const UNIT: Record<string, QuickRhythm["unit"]> = {
  day: "day", days: "day", tag: "day", tage: "day", jour: "day", jours: "day", día: "day", dia: "day", días: "day",
  week: "week", weeks: "week", woche: "week", wochen: "week", semaine: "week", semaines: "week", semana: "week", semanas: "week",
  month: "month", months: "month", monat: "month", monate: "month", mois: "month", mes: "month", meses: "month",
  year: "year", years: "year", jahr: "year", jahre: "year", année: "year", ans: "year", año: "year", años: "year",
};
const UNITS = Object.keys(UNIT).sort((a, b) => b.length - a.length).join("|");
const RHYTHM_WORD: Record<string, Omit<QuickRhythm, "weekdays">> = {
  daily: { every: 1, unit: "day" }, täglich: { every: 1, unit: "day" }, quotidiennement: { every: 1, unit: "day" }, diariamente: { every: 1, unit: "day" },
  weekly: { every: 1, unit: "week" }, wöchentlich: { every: 1, unit: "week" }, hebdomadairement: { every: 1, unit: "week" }, semanalmente: { every: 1, unit: "week" },
  biweekly: { every: 2, unit: "week" }, fortnightly: { every: 2, unit: "week" },
  monthly: { every: 1, unit: "month" }, monatlich: { every: 1, unit: "month" }, mensuellement: { every: 1, unit: "month" }, mensualmente: { every: 1, unit: "month" },
  yearly: { every: 1, unit: "year" }, annually: { every: 1, unit: "year" }, jährlich: { every: 1, unit: "year" }, annuellement: { every: 1, unit: "year" }, anualmente: { every: 1, unit: "year" },
};
const KIND_PREFIX: Record<string, QuickKind> = { t: "task", task: "task", todo: "task", e: "event", event: "event", h: "habit", habit: "habit", n: "note", note: "note" };
const KIND_WORD: Record<string, QuickKind> = { task: "task", todo: "task", "to-do": "task", reminder: "task", event: "event", note: "note", notes: "note" };
const VERBS = new Set(["create", "new", "add", "make"]);
const FILLER = new Set(["a", "an", "the", "with", "for", "use", "title", "titled", "called", "named"]);
const EVENT_WORDS = new Set(["meeting", "call", "lunch", "appointment"]);
const MON_FRI = [1, 2, 3, 4, 5];
// A time without a day, as quick capture's tokens() writes it.
const TIME_ONLY = /^(?:(?:at|um|à|a|by|gegen|vers)\s+)?\d{1,2}(?:[:.h]\d{2})?\s*(?:[ap]\.?m\.?|uhr|h)?$/i;
const LEVEL: Record<string, QuickAdd["priority"]> = { "!": 1, "!!": 2, "!!!": 3, "!low": 1, "!medium": 2, "!med": 2, "!high": 3, "!none": 0, "!0": 0, "!1": 1, "!2": 2, "!3": 3 };

// ---- The parse ----

export function parseQuickAdd(input: string, context: QuickContext): QuickAdd {
  const text = String(input).slice(0, QUICK_ADD_MAX);
  const today = DAY.test(context.today) ? context.today : iso(new Date());
  const weekStartsOn = context.weekStartsOn ?? 1;
  const locale = context.locale || "en";
  const y0 = Number(today.slice(0, 4)),
    m0 = Number(today.slice(5, 7));
  const spans: QuickSpan[] = [];
  // The text with every recognized part blanked out; same length as `text`.
  let masked = text;
  const free = (start: number, end: number) => !spans.some((s) => start < s.end && end > s.start);
  const take = (start: number, end: number, role: QuickRole) => {
    const span = { start, end, role };
    spans.push(span);
    masked = masked.slice(0, start) + " ".repeat(end - start) + masked.slice(end);
    return span;
  };
  // "at" and "on" right before a day or time go with it ("Call Anna on friday at 10:00").
  const takeDate = (start: number, end: number) => {
    const before = new RegExp(`${B}(?:at|on)\\s+$`, "iu").exec(masked.slice(0, start));
    return take(before ? before.index : start, end, "date");
  };
  const scan = (source: string) => [...masked.matchAll(new RegExp(source, "giu"))].filter((m) => free(m.index!, m.index! + m[0].length));

  // Kind: the badge, then a prefix as the first word.
  let kind: QuickKind | null = context.kind ?? null;
  let kindFrom: QuickAdd["kindFrom"] = context.kind ? "badge" : "guess";
  const prefix = /^\s*(t|task|todo|e|event|h|habit|n|note):\s*/i.exec(text);
  if (prefix) {
    take(0, prefix[0].length, "kind");
    if (!kind) [kind, kindFrom] = [KIND_PREFIX[prefix[1].toLowerCase()], "prefix"];
  }
  const titleStart = prefix ? prefix[0].length : 0;

  // A link, the first one.
  let link: string | null = null;
  const url = scan(`${B}https?://[^\\s<>"]+`)[0];
  if (url) {
    link = url[0].replace(/[),.;:!?]+$/, "");
    take(url.index!, url.index! + link.length, "link");
  }

  // Tags: #word, and "tag word" / "tags word".
  const tags: string[] = [];
  const addTag = (word: string) => {
    if (!tags.some((t) => t.toLowerCase() === word.toLowerCase())) tags.push(word);
  };
  for (const m of scan(`(?<=^|[\\s(,;])#([\\p{L}\\p{N}_][\\p{L}\\p{N}_\\-/]*)`)) {
    const word = m[1].replace(/[-/]+$/, "");
    if (/^\d+$/.test(word)) continue;
    take(m.index!, m.index! + 1 + word.length, "tag");
    addTag(word);
  }
  for (const m of scan(`${B}tags?\\s+([\\p{L}\\p{N}_][\\p{L}\\p{N}_\\-]*)${E}`)) {
    take(m.index!, m.index! + m[0].length, "tag");
    addTag(m[1]);
  }

  // Folder: $name, only an existing one, only the first.
  let folder: string | null = null;
  for (const m of scan(`(?<=^|[\\s(,;])\\$([\\p{L}\\p{N}_][\\p{L}\\p{N}_\\-]*)`)) {
    const wanted = m[1].toLowerCase();
    const found = (context.folders || []).find((f) => f.toLowerCase() === wanted || f.toLowerCase().replace(/\s+/g, "") === wanted);
    if (!found) continue;
    folder = found;
    take(m.index!, m.index! + m[0].length, "folder");
    break;
  }

  // Priority: a standalone ! (low), !! (medium), !!! (high), or !low … !high, !0 … !3.
  let priority: QuickAdd["priority"] = 0;
  const bang = scan(`(?<=^|\\s)(!{1,3}|!low|!medium|!med|!high|!none|![0-3])(?=$|[\\s.,;:)])`)[0];
  if (bang) {
    priority = LEVEL[bang[1].toLowerCase()];
    take(bang.index!, bang.index! + bang[1].length, "priority");
  }

  // Duration: ~30m, ~45 min, ~1h, ~1.5h, ~1h30.
  let duration: number | null = null;
  const tilde = scan(`(?<=^|\\s)~(\\d{1,3}(?:[.,]\\d+)?)\\s?(hours?|hrs?|h|minutes?|mins?|m)(\\d{2})?${E}`)[0];
  if (tilde) {
    const n = Number(tilde[1].replace(",", "."));
    const minutes = /^h/i.test(tilde[2]) ? Math.round(n * 60) + Number(tilde[3] || 0) : Math.round(n);
    if (minutes > 0 && minutes <= 24 * 60) {
      duration = minutes;
      take(tilde.index!, tilde.index! + tilde[0].length, "duration");
    }
  }

  // Rhythms (habits). A single word at the very start stays in the title
  // ("Weekly review"); everything else leaves it ("Review finances monthly").
  let rhythm: QuickRhythm | null = null;
  let rhythmSpan: QuickSpan | null = null;
  let keepRhythmWords = false;
  const days = (list: string) => [...new Set([...list.matchAll(new RegExp(`${B}${WD}${E}`, "giu"))].map((d) => wd(d[0])).filter((d) => d !== undefined))].sort((a, b) => a - b);
  const LIST = `${WD}(?:\\s*(?:,|and|&|\\+|und|et|y)\\s*${WD})*`;
  const RHYTHMS: [string, (m: RegExpMatchArray) => QuickRhythm | null, boolean?][] = [
    [`${B}${EVERY}\\s+other\\s+(${WD})${E}`, (m) => ({ every: 2, unit: "week", weekdays: days(m[1]) })],
    [`${B}${EVERY}\\s+(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|other|second|2nd)\\s+(${UNITS})${E}`, (m) => {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER[m[1].toLowerCase()];
      return n >= 1 && n <= 99 ? { every: n, unit: UNIT[m[2].toLowerCase()], weekdays: [] } : null;
    }],
    [`${B}${EVERY}\\s+(?:weekday|workday)s?${E}`, () => ({ every: 1, unit: "week", weekdays: MON_FRI })],
    [`${B}${EVERY}\\s+weekends?${E}`, () => ({ every: 1, unit: "week", weekdays: [0, 6] })],
    [`${B}${EVERY}\\s+(${LIST})${E}`, (m) => ({ every: 1, unit: "week", weekdays: days(m[1]) })],
    [`${B}${EVERY}\\s+(${UNITS})${E}`, (m) => ({ every: 1, unit: UNIT[m[1].toLowerCase()], weekdays: [] })],
    [`${B}on\\s+(weekdays|weekends)${E}`, (m) => ({ every: 1, unit: "week", weekdays: /weekdays/i.test(m[1]) ? MON_FRI : [0, 6] })],
    // "on mondays and thursdays": plural weekdays only ("on monday" is a day).
    [`${B}on\\s+(${WD_PLURAL}(?:\\s*(?:,|and|&|\\+)\\s*${WD_PLURAL})*)${E}`, (m) => ({ every: 1, unit: "week", weekdays: days(m[1]) })],
    [`${B}(${Object.keys(RHYTHM_WORD).join("|")})${E}`, (m) => ({ ...RHYTHM_WORD[m[1].toLowerCase()], weekdays: [] }), true],
  ];
  rhythms: for (const [source, read, single] of RHYTHMS) {
    for (const m of scan(source)) {
      const value = read(m);
      if (!value) continue;
      rhythm = value;
      rhythmSpan = take(m.index!, m.index! + m[0].length, "rhythm");
      keepRhythmWords = !!single && !text.slice(titleStart, m.index!).trim();
      break rhythms;
    }
  }

  // Periods before days: "next week" is a week here, not its Monday.
  let period: QuickPeriod | null = null;
  const PERIODS: [string, (m: RegExpMatchArray) => QuickPeriod | null][] = [
    [`${B}(?:someday|some\\s+day|irgendwann|un\\s+jour|algún\\s+día|algun\\s+dia)${E}`, () => ({ kind: "someday" })],
    [`${B}(?:this\\s+week|diese\\s+woche|cette\\s+semaine|esta\\s+semana)${E}`, () => ({ kind: "week", start: weekStart(today, weekStartsOn) })],
    [`${B}(?:next\\s+week|nächste\\s+woche|kommende\\s+woche|(?:la\\s+)?semaine\\s+prochaine|(?:la\\s+)?pr[óo]xima\\s+semana)${E}`, () => ({ kind: "week", start: addDays(weekStart(today, weekStartsOn), 7) })],
    [`${B}(?:this\\s+month|diesen\\s+monat|ce\\s+mois(?:-ci)?|este\\s+mes)${E}`, () => ({ kind: "month", start: monthStart(y0, m0) })],
    [`${B}(?:next\\s+month|nächsten\\s+monat|(?:le\\s+)?mois\\s+prochain|(?:el\\s+)?pr[óo]ximo\\s+mes)${E}`, () => ({ kind: "month", start: m0 === 12 ? monthStart(y0 + 1, 1) : monthStart(y0, m0 + 1) })],
    [`${B}(${MON})\\s+week\\s+([1-5])(?:\\s+(\\d{4}))?${E}`, (m) => {
      const month = MONTH[m[1].toLowerCase()];
      const year = m[3] ? Number(m[3]) : month < m0 ? y0 + 1 : y0;
      return { kind: "week", start: addDays(weekStart(monthStart(year, month), weekStartsOn), 7 * (Number(m[2]) - 1)) };
    }],
    [`${B}(?:week|woche|semaine|semana|kw)\\s*(\\d{1,2})(?:\\s+(\\d{4}))?${E}`, (m) => {
      const n = Number(m[1]);
      if (n < 1 || n > 53) return null;
      let year = m[2] ? Number(m[2]) : y0;
      let start = isoWeekStart(year, n, weekStartsOn);
      if (!m[2] && addDays(start, 6) < today) start = isoWeekStart(++year, n, weekStartsOn);
      return { kind: "week", start };
    }],
  ];
  periods: for (const [source, read] of PERIODS) {
    for (const m of scan(source)) {
      const value = read(m);
      if (!value) continue;
      period = value;
      take(m.index!, m.index! + m[0].length, "date");
      break periods;
    }
  }

  // "tonight" is 20:00 today (quick capture reads it as just today).
  let date: string | null = null,
    time: string | null = null,
    explicitDay = false;
  const tonight = scan(`${B}(?:tonight|this\\s+evening|heute\\s+abend|ce\\s+soir|esta\\s+noche)${E}`)[0];
  if (tonight) {
    takeDate(tonight.index!, tonight.index! + tonight[0].length);
    [date, time, explicitDay] = [today, "20:00", true];
  }

  // Days and times: quick capture's recognizer on what is left ("@friday" is a
  // day too). A day and a time apart ("friday … 14:00") take two passes.
  for (let pass = 0; pass < 2; pass++) {
    const found = tokens(masked.replace(/(^|\s)@(?=\S)/g, "$1 "), { today, locale }).find((t) => t.kind === "date" && free(t.start, t.end));
    if (!found) break;
    const value = found.value as { date: string; time?: string };
    const timeOnly = TIME_ONLY.test(found.raw.trim());
    if ((!timeOnly && explicitDay) || (timeOnly && time)) break;
    takeDate(text[found.start - 1] === "@" ? found.start - 1 : found.start, found.end);
    if (!timeOnly) [date, explicitDay] = [value.date, true];
    else if (!date) date = value.date;
    if (value.time) time = value.time;
    if (time && explicitDay) break;
  }

  // A month alone ("october", "october 2027", "2027 october") is a month period.
  if (!period && !explicitDay) {
    const month = scan(`${B}(?:(${MON})(?:\\s+(\\d{4}))?|(\\d{4})\\s+(${MON}))${E}`).find((m) => m[2] || m[3] || !WORDLIKE_MONTHS.has(m[1].toLowerCase()));
    if (month) {
      const n = MONTH[(month[1] || month[4]).toLowerCase()];
      const year = month[2] || month[3] ? Number(month[2] || month[3]) : n < m0 ? y0 + 1 : y0;
      period = { kind: "month", start: monthStart(year, n) };
      take(month.index!, month.index! + month[0].length, "date");
    }
  }

  // Kind words and command sentences ("add a task for the dentist friday").
  const words = [...masked.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map((m) => ({ word: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  if (!kind) {
    const kindWord = words.find((w) => KIND_WORD[w.word]);
    if (kindWord) {
      [kind, kindFrom] = [KIND_WORD[kindWord.word], "word"];
      take(kindWord.start, kindWord.end, "kind");
      if (words.some((w) => VERBS.has(w.word)))
        for (const w of words) if (w !== kindWord && (VERBS.has(w.word) || FILLER.has(w.word))) take(w.start, w.end, "kind");
    }
  }
  if (kind === "task" && rhythm) kind = "habit";
  if (!kind) kind = rhythm ? "habit" : words.some((w) => EVENT_WORDS.has(w.word)) || time ? "event" : "task";
  // Events and notes never repeat: their rhythm words stay as typed.
  if ((kind === "event" || kind === "note") && rhythmSpan) {
    spans.splice(spans.indexOf(rhythmSpan), 1);
    [rhythm, rhythmSpan] = [null, null];
  }
  if (kind === "habit" && !rhythm) rhythm = { every: 1, unit: "day", weekdays: [] };

  // The title: everything not recognized (rhythm words at the start stay).
  const removed = spans.filter((s) => !(keepRhythmWords && s === rhythmSpan));
  let title = "";
  for (let i = 0; i < text.length; i++) if (!removed.some((s) => i >= s.start && i < s.end)) title += text[i];
  title = title
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])(?=\s|$)/g, "$1")
    .replace(/^[\s,;:–-]+|[\s,;–-]+$/g, "")
    .trim()
    .slice(0, 300);
  if (!title && link) title = hostName(link);

  // What each kind does with the day, time and period.
  let endDate: string | null = null,
    end: string | null = null,
    allDay = false;
  if (kind === "event") {
    if (period && !date) date = period.kind === "someday" ? today : period.start;
    period = null;
    date ??= today;
    if (time) {
      const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + (duration ?? context.eventMinutes ?? 60);
      endDate = addDays(date, Math.floor(minutes / 1440));
      end = `${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;
    } else allDay = true;
    priority = 0;
  } else if (kind === "habit") {
    period = null;
    if (!explicitDay) {
      date = today;
      // The first day the rhythm's weekdays allow.
      const allowed = rhythm!.weekdays;
      if (allowed.length) while (!allowed.includes(weekdayOf(date))) date = addDays(date, 1);
    }
  } else if (kind === "note") {
    [period, time, priority, duration] = [null, null, 0, null];
  } else if (period) [date, time] = [null, null];

  return { kind, kindFrom, title, date, time, endDate, end, allDay, period, priority, tags, folder, rhythm, duration, link, spans: spans.sort((a, b) => a.start - b.start) };
}

function hostName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// How a rhythm reads ("Every day", "Mon, Wed, Fri", "Every 2 weeks").
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function rhythmLabel(r: QuickRhythm) {
  const list = r.weekdays.join();
  const on = !r.weekdays.length ? "" : list === "1,2,3,4,5" ? "Weekdays" : list === "0,6" ? "Weekends" : r.weekdays.map((d) => SHORT[d]).join(", ");
  if (on) return r.every === 1 ? on : `Every ${r.every} weeks · ${on}`;
  if (r.every === 1) return { day: "Every day", week: "Every week", month: "Every month", year: "Every year" }[r.unit];
  return `Every ${r.every} ${r.unit}s`;
}
