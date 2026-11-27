"use client";
// A habit's repeat rule: every N days, weeks, months or years (1–99);
// weekday buttons with Weekdays and Weekends; a day of the month; ends
// never, on a date or after N check-ins; a reminder time.
import { useId } from "react";
import { useT } from "../i18n";
import { DurationPicker, fromTime, toTime } from "./duration-picker";
import { Select } from "../select";
import { DAILY, type RepeatRule } from "@/lib/daybar/repeat";
import { weekdayName } from "./format";

export function RepeatEditor({ rule, onChange, weekStartsOn }: { rule: RepeatRule | null; onChange: (rule: RepeatRule) => void; weekStartsOn: 0 | 1 }) {
  const t = useT();
  const id = useId();
  const r = rule ?? DAILY;
  const set = (patch: Partial<RepeatRule>) => onChange({ ...r, ...patch });
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStartsOn) % 7);
  const toggleDay = (d: number) => set({ weekdays: r.weekdays.includes(d) ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d].sort((a, b) => a - b) });
  return (
    <div className="db-repeat">
      <div className="db-field-row">
        <label htmlFor={`${id}-every`}>{t("Alle", "Every")}</label>
        <input
          id={`${id}-every`}
          type="number"
          min={1}
          max={99}
          className="db-input db-input-number"
          value={r.every}
          onChange={(e) => {
            const n = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
            set({ every: n });
          }}
        />
        <Select aria-label={t("Einheit", "Unit")} value={r.unit} onChange={(e) => set({ unit: e.target.value as RepeatRule["unit"], weekdays: e.target.value === "week" ? r.weekdays : [], monthDay: e.target.value === "month" ? r.monthDay : null })}>
          <option value="day">{r.every === 1 ? t("Tag", "day") : t("Tage", "days")}</option>
          <option value="week">{r.every === 1 ? t("Woche", "week") : t("Wochen", "weeks")}</option>
          <option value="month">{r.every === 1 ? t("Monat", "month") : t("Monate", "months")}</option>
          <option value="year">{r.every === 1 ? t("Jahr", "year") : t("Jahre", "years")}</option>
        </Select>
      </div>
      {r.unit === "week" && (
        <>
          <div className="db-weekdays" role="group" aria-label={t("Wochentage", "Weekdays")}>
            {order.map((d) => (
              <button key={d} type="button" aria-pressed={r.weekdays.includes(d)} className="db-weekday" onClick={() => toggleDay(d)}>
                {weekdayName(d)}
              </button>
            ))}
          </div>
          <div className="db-chip-row">
            <button type="button" className="db-chip-button" onClick={() => set({ weekdays: [1, 2, 3, 4, 5] })}>
              {t("Werktags", "Weekdays")}
            </button>
            <button type="button" className="db-chip-button" onClick={() => set({ weekdays: [0, 6] })}>
              {t("Wochenende", "Weekends")}
            </button>
            <button type="button" className="db-chip-button" onClick={() => set({ weekdays: [] })}>
              {t("Wie der erste Tag", "Like the first day")}
            </button>
          </div>
        </>
      )}
      {r.unit === "month" && (
        <div className="db-field-row">
          <label htmlFor={`${id}-mday`}>{t("Am Tag", "On day")}</label>
          <input
            id={`${id}-mday`}
            type="number"
            min={1}
            max={31}
            className="db-input db-input-number"
            value={r.monthDay ?? ""}
            placeholder={t("wie der erste", "as the first")}
            onChange={(e) => set({ monthDay: e.target.value ? Math.max(1, Math.min(31, Math.round(Number(e.target.value)))) : null })}
          />
          <small className="db-hint">{t("Kurze Monate: der letzte Tag", "Short months: the last day")}</small>
        </div>
      )}
      <div className="db-field-row">
        <label htmlFor={`${id}-ends`}>{t("Endet", "Ends")}</label>
        <Select
          id={`${id}-ends`}
          value={r.ends.kind}
          onChange={(e) => {
            const kind = e.target.value as RepeatRule["ends"]["kind"];
            set({ ends: kind === "on" ? { kind, date: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) } : kind === "after" ? { kind, count: 30 } : { kind } });
          }}
        >
          <option value="never">{t("Nie", "Never")}</option>
          <option value="on">{t("Am Datum", "On a date")}</option>
          <option value="after">{t("Nach Anzahl", "After a number")}</option>
        </Select>
        {r.ends.kind === "on" && (
          <input type="date" className="db-input" aria-label={t("Enddatum", "End date")} value={r.ends.date} onChange={(e) => e.target.value && set({ ends: { kind: "on", date: e.target.value } })} />
        )}
        {r.ends.kind === "after" && (
          <input
            type="number"
            min={1}
            max={9999}
            className="db-input db-input-number"
            aria-label={t("Anzahl", "Number of times")}
            value={r.ends.count}
            onChange={(e) => set({ ends: { kind: "after", count: Math.max(1, Math.min(9999, Math.round(Number(e.target.value) || 1))) } })}
          />
        )}
      </div>
      <div className="db-field-row">
        <span className="db-field-row-label">{t("Erinnerung", "Reminder")}</span>
        <DurationPicker mode="time" label={t("Erinnerung", "Reminder")} value={fromTime(r.remind)} onChange={(v) => set({ remind: toTime(v) })} />
      </div>
    </div>
  );
}
