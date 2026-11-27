// Dates and times of the planner in the page's language (lib/locale-tag.ts):
// "Today", "Tomorrow", "Thu 27 Nov", "9:30 am" or "09:30", "1 h 30 min".
import { LOCALE_TAG } from "@/lib/locale-tag";
import { addDays, diffDays, isoWeek, minutesOf, monthStart } from "@/lib/daybar/model";

type T = (de: string, en: string) => string;
const date = (day: string) => new Date(`${day}T12:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE_TAG, { timeZone: "UTC", ...options });
const F = {
  weekdayShort: fmt({ weekday: "short" }),
  weekdayNarrow: fmt({ weekday: "narrow" }),
  weekdayLong: fmt({ weekday: "long" }),
  dayMonth: fmt({ day: "numeric", month: "short" }),
  dayMonthLong: fmt({ day: "numeric", month: "long" }),
  monthYear: fmt({ month: "long", year: "numeric" }),
  month: fmt({ month: "long" }),
  monthShort: fmt({ month: "short" }),
  full: fmt({ weekday: "long", day: "numeric", month: "long" }),
  fullYear: fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  short: fmt({ weekday: "short", day: "numeric", month: "short" }),
};
export const weekdayShort = (day: string) => F.weekdayShort.format(date(day));
export const weekdayNarrow = (day: string) => F.weekdayNarrow.format(date(day));
export const weekdayLong = (day: string) => F.weekdayLong.format(date(day));
export const dayNumber = (day: string) => Number(day.slice(8, 10));
export const monthYear = (day: string) => F.monthYear.format(date(day));
export const monthName = (day: string) => F.month.format(date(day));
export const dayMonth = (day: string) => F.dayMonth.format(date(day));
export const fullDay = (day: string, today?: string) => (today && day.slice(0, 4) !== today.slice(0, 4) ? F.fullYear : F.full).format(date(day));
// A weekday's name for 0 = Sunday … 6 = Saturday (1 Nov 2026 is a Sunday).
export const weekdayName = (n: number) => F.weekdayShort.format(date(`2026-11-0${1 + n}`));

// "Today", "Tomorrow", "Yesterday", a weekday within the week ahead, else "Thu 27 Nov".
export function dayLabel(day: string, today: string, t: T) {
  const d = diffDays(today, day);
  if (d === 0) return t("Heute", "Today");
  if (d === 1) return t("Morgen", "Tomorrow");
  if (d === -1) return t("Gestern", "Yesterday");
  if (d > 1 && d < 7) return weekdayLong(day);
  return F.short.format(date(day)) + (day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : "");
}
const HOUR12 = new Intl.DateTimeFormat(LOCALE_TAG, { hour: "numeric" }).resolvedOptions().hour12;
const timeFmt = new Intl.DateTimeFormat(LOCALE_TAG, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
export function timeLabel(time: string | null | undefined) {
  if (!time) return "";
  return timeFmt.format(new Date(Date.UTC(2026, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5)))));
}
// The hour of a calendar row: "9 am" or "09".
const hourFmt = new Intl.DateTimeFormat(LOCALE_TAG, { hour: "numeric", timeZone: "UTC" });
export const hourLabel = (hour: number) => (HOUR12 ? hourFmt.format(new Date(Date.UTC(2026, 0, 1, hour % 24))) : `${String(hour % 24).padStart(2, "0")}:00`);
export function durationLabel(minutes: number | null | undefined, t: T) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  if (!h) return t(`${m} Min.`, `${m} min`);
  return m ? t(`${h} Std. ${m} Min.`, `${h} h ${m} min`) : t(`${h} Std.`, `${h} h`);
}
// "09:00–10:30", or the end day too when the event runs past midnight.
export function spanLabel(item: { day: string | null; time: string | null; endDay: string | null; endTime: string | null; allDay: boolean }, today: string, t: T) {
  if (!item.day) return "";
  if (item.allDay) {
    if (item.endDay && item.endDay > item.day) return `${dayLabel(item.day, today, t)} – ${dayLabel(item.endDay, today, t)}`;
    return t("Ganztägig", "All day");
  }
  const end = item.endTime ? timeLabel(item.endTime) : "";
  if (item.endDay && item.endDay !== item.day) return `${timeLabel(item.time)} – ${dayLabel(item.endDay, today, t)} ${end}`;
  return end ? `${timeLabel(item.time)}–${end}` : timeLabel(item.time);
}
// The heading of a task group: a day, a week, a month.
export function weekLabel(start: string, today: string, t: T, weekStartsOn: 0 | 1) {
  const thisWeek = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7));
  if (start === thisWeek) return t("Diese Woche", "This week");
  if (start === addDays(thisWeek, 7)) return t("Nächste Woche", "Next week");
  return t(`Woche ${isoWeek(start)} · ab ${dayMonth(start)}`, `Week ${isoWeek(start)} · from ${dayMonth(start)}`);
}
export function monthLabel(start: string, today: string, t: T) {
  if (start === monthStart(today)) return t("Dieser Monat", "This month");
  return start.slice(0, 4) === today.slice(0, 4) ? monthName(start) : monthYear(start);
}
// A countdown such as "in 3 days" for waiting tasks.
export function countdown(day: string, today: string, t: T) {
  const d = diffDays(today, day);
  if (d <= 0) return t("heute zurück", "back today");
  if (d === 1) return t("morgen zurück", "back tomorrow");
  return t(`in ${d} Tagen zurück`, `back in ${d} days`);
}
export const minutesBetween = (from: string, to: string) => minutesOf(to) - minutesOf(from);
export const pad2 = (n: number) => String(n).padStart(2, "0");
