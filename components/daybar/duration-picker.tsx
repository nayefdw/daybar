"use client";
// Hours and minutes in one pill (after rareui's Duration picker): three soft
// segments that read as one – the hours, the minutes and a pen. The pen
// opens them: the segments move apart, the numbers become fields and the
// pen turns into a tick that saves (Enter too; Escape keeps the old value).
// A number out of range is clamped and the field shakes. With mode "time"
// it sets a time of day (00–23 : 00–59); a time can also be cleared.
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useT } from "../i18n";

export type HoursMinutes = { hours: number; minutes: number };
type Mode = "duration" | "time";

// "14:30" ↔ { hours: 14, minutes: 30 }; minutes ↔ { hours, minutes }.
export const fromTime = (time: string | null): HoursMinutes | null => (time ? { hours: Number(time.slice(0, 2)), minutes: Number(time.slice(3, 5)) } : null);
export const toTime = (v: HoursMinutes | null) => (v ? `${String(v.hours).padStart(2, "0")}:${String(v.minutes).padStart(2, "0")}` : null);
export const fromMinutes = (m: number | null): HoursMinutes | null => (m ? { hours: Math.floor(m / 60), minutes: m % 60 } : null);
export const toMinutes = (v: HoursMinutes | null) => (v ? v.hours * 60 + v.minutes : 0);

const text = (n: number | undefined, mode: Mode) => (n === undefined ? "" : mode === "time" ? String(n).padStart(2, "0") : n ? String(n) : "");

export function DurationPicker({
  mode,
  value,
  onChange,
  label,
  clearable = mode === "time",
}: {
  mode: Mode;
  value: HoursMinutes | null;
  onChange: (value: HoursMinutes | null) => void;
  label: string;
  clearable?: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(() => text(value?.hours, mode));
  const [minutes, setMinutes] = useState(() => text(value?.minutes, mode));
  const [shake, setShake] = useState<"h" | "m" | null>(null);
  const hoursInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const maxHours = mode === "time" ? 23 : 24;

  // A new value from outside (another device, the right-click menu).
  useEffect(() => {
    if (editing) return;
    setHours(text(value?.hours, mode));
    setMinutes(text(value?.minutes, mode));
  }, [value?.hours, value?.minutes, mode, editing]);
  useEffect(() => {
    if (!shake) return;
    const timer = setTimeout(() => setShake(null), 360);
    return () => clearTimeout(timer);
  }, [shake]);

  const typed = (field: "h" | "m", raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    const max = field === "h" ? maxHours : 59;
    const clamped = digits && Number(digits) > max ? String(max) : digits;
    if (clamped !== digits) setShake(field);
    (field === "h" ? setHours : setMinutes)(clamped);
  };
  const result = (): HoursMinutes | null => {
    if (!hours && !minutes) return null;
    let h = Math.min(maxHours, Number(hours) || 0);
    let m = Math.min(59, Number(minutes) || 0);
    // A duration of at most a day.
    if (mode === "duration" && h * 60 + m > 24 * 60) [h, m] = [24, 0];
    return mode === "duration" && !h && !m ? null : { hours: h, minutes: m };
  };
  const save = () => {
    setEditing(false);
    const next = result();
    if (next?.hours !== value?.hours || next?.minutes !== value?.minutes) onChange(next);
  };
  const cancel = () => {
    setEditing(false);
    setHours(text(value?.hours, mode));
    setMinutes(text(value?.minutes, mode));
  };
  // A click elsewhere saves what was typed.
  useEffect(() => {
    if (!editing) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && save();
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, hours, minutes]);

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.preventDefault(), save());
    if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), cancel());
  };
  const field = (which: "h" | "m") => {
    const shown = which === "h" ? hours : minutes;
    return (
      <input
        ref={which === "h" ? hoursInput : undefined}
        className={`db-dur-input${shake === which ? " is-shaking" : ""}`}
        inputMode="numeric"
        value={shown}
        placeholder={mode === "time" ? "––" : "0"}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        style={{ "--chars": Math.max(1, (shown || (mode === "time" ? "––" : "0")).length) } as React.CSSProperties}
        aria-label={which === "h" ? (mode === "time" ? t("Stunde", "Hour") : t("Stunden", "Hours")) : t("Minuten", "Minutes")}
        onChange={(e) => typed(which, e.target.value)}
        onFocus={(e) => editing && e.target.select()}
        onKeyDown={keys}
        onClick={() => !editing && start()}
      />
    );
  };
  const start = () => {
    setEditing(true);
    // At once, so nothing typed right after the click goes elsewhere.
    hoursInput.current?.focus();
    hoursInput.current?.select();
  };

  return (
    <div ref={root} className={`db-dur is-${mode}${editing ? " is-editing" : ""}`} role="group" aria-label={label}>
      <span className="db-dur-seg is-first">
        {field("h")}
        <span className="db-dur-unit">{mode === "time" ? ":" : t("Std.", "h")}</span>
      </span>
      <span className="db-dur-seg">
        {field("m")}
        {mode === "duration" && <span className="db-dur-unit">{t("Min.", "min")}</span>}
      </span>
      <button
        type="button"
        className="db-dur-seg db-dur-toggle"
        onClick={() => (editing ? save() : start())}
        aria-label={editing ? t(`${label} speichern`, `Save ${label.toLowerCase()}`) : t(`${label} ändern`, `Change ${label.toLowerCase()}`)}
      >
        <Pencil className="db-dur-pen" size={15} aria-hidden />
        <Check className="db-dur-tick" size={16} strokeWidth={2.5} aria-hidden />
      </button>
      {clearable && value && !editing && (
        <button type="button" className="db-dur-clear" onClick={() => onChange(null)} aria-label={t(`${label} entfernen`, `Remove ${label.toLowerCase()}`)}>
          <X size={13} aria-hidden />
        </button>
      )}
    </div>
  );
}
