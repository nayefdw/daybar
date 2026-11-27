"use client";
// Quick Add: one sentence becomes a task, event, note or habit
// (lib/daybar/quick-add.ts parseQuickAdd). The input colours what it
// recognised (the parser's spans), a badge shows the kind (Task blue, Event
// red, Note yellow, Habit orange; a click fixes it), and the Create row says
// what Enter makes – with the day's timeline for a timed item. Typing a
// symbol at the start of a word opens its menu: # tags, @ days, ! priority,
// ~ duration, * repeat, $ folders. Used by the dialog (⌘N, ⇧⌘N, ⌥⌘N, the
// top bar's New), the capture lines of the screens and the ⌘K palette.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Calendar, Check, CircleCheck, Hash, Repeat, StickyNote, X } from "lucide-react";
import { useT } from "../i18n";
import { PAGE_LOCALE } from "@/lib/locale-tag";
import { parseQuickAdd, type QuickAdd, type QuickKind, type QuickRole } from "@/lib/daybar/quick-add";
import { addDays, eventOnDay, minutesOf, weekdayOf, type PlannerItem } from "@/lib/daybar/model";
import { ruleFromRhythm, ruleLabel } from "@/lib/daybar/repeat";
import { usePlannerUi, type QuickAddRequest } from "./context";
import { dayLabel, durationLabel, hourLabel, monthLabel, timeLabel, weekLabel, weekdayName } from "./format";
import type { ItemDraft } from "./store";

type T = (de: string, en: string) => string;
export const KIND_ORDER: QuickKind[] = ["task", "event", "note", "habit"];
export const kindLabel = (kind: QuickKind, t: T) => ({ task: t("Aufgabe", "Task"), event: t("Termin", "Event"), note: t("Notiz", "Note"), habit: t("Gewohnheit", "Habit") })[kind];
const KIND_ICON = { task: CircleCheck, event: Calendar, note: StickyNote, habit: Repeat } as const;

// The parse with the planner's context (folders, week start, event length).
export function useQuickParse(text: string, kind: QuickKind | undefined) {
  const { state, today } = usePlannerUi();
  return useMemo(
    () =>
      parseQuickAdd(text, {
        today,
        locale: PAGE_LOCALE,
        folders: state?.folders.map((f) => f.name) || [],
        weekStartsOn: state?.settings.weekStart ?? 1,
        eventMinutes: state?.settings.eventMinutes ?? 60,
        kind,
      }),
    [text, kind, state?.folders, state?.settings.weekStart, state?.settings.eventMinutes, today],
  );
}

// The parse as an item to create (tag names; the folder by its name).
export function draftOf(parsed: QuickAdd, folders: { id: string; name: string }[], defaults: Partial<ItemDraft> = {}): ItemDraft {
  const draft: ItemDraft = {
    ...defaults,
    kind: parsed.kind,
    title: parsed.title,
    priority: parsed.priority,
    tags: [...new Set([...(defaults.tags || []), ...parsed.tags])],
    folderId: parsed.folder ? (folders.find((f) => f.name === parsed.folder)?.id ?? null) : (defaults.folderId ?? null),
    link: parsed.link,
  };
  if (parsed.duration) draft.duration = parsed.duration;
  const dated = parsed.date || parsed.period;
  // An event: the sentence's day and time, else the place's (a slot dragged
  // in the calendar brings its end too).
  if (parsed.kind === "event")
    Object.assign(
      draft,
      parsed.time
        ? { day: parsed.date ?? defaults.day ?? null, time: parsed.time, endDay: parsed.endDate, endTime: parsed.end, allDay: false }
        : { day: parsed.date ?? defaults.day ?? null, time: defaults.time ?? null, endDay: defaults.endDay ?? null, endTime: defaults.endTime ?? null, allDay: !defaults.time },
    );
  else if (parsed.kind === "habit") Object.assign(draft, { day: parsed.date ?? defaults.day ?? null, time: parsed.time, repeat: parsed.rhythm ? ruleFromRhythm(parsed.rhythm) : undefined });
  else if (parsed.kind === "note") Object.assign(draft, { day: parsed.date ?? defaults.day ?? null });
  else if (parsed.period) Object.assign(draft, { period: parsed.period.kind, day: parsed.period.kind === "someday" ? null : parsed.period.start, time: null });
  else Object.assign(draft, { day: dated ? parsed.date : (defaults.day ?? null), time: parsed.time ?? (dated ? null : (defaults.time ?? null)), period: dated ? null : (defaults.period ?? null) });
  return draft;
}

// ---- Symbol menus ----

type Option = { label: string; insert: string; hint?: string };
const SYMBOLS = ["#", "@", "!", "~", "*", "$"] as const;
type Symbol = (typeof SYMBOLS)[number];
function symbolOptions(symbol: Symbol, t: T, tags: string[], folders: string[], today: string): Option[] {
  switch (symbol) {
    case "#":
      return tags.map((name) => ({ label: `#${name}`, insert: `#${name.replace(/\s+/g, "-")} ` }));
    case "$":
      return folders.map((name) => ({ label: name, insert: `$${name.replace(/\s+/g, "")} ` }));
    case "@": {
      const word = (en: string, de: string) => (PAGE_LOCALE === "de" ? de : en);
      return [
        { label: t("Heute", "Today"), insert: `${word("today", "heute")} ` },
        { label: t("Heute Abend", "Tonight"), insert: `${word("tonight", "heute abend")} ` },
        { label: t("Morgen", "Tomorrow"), insert: `${word("tomorrow", "morgen")} ` },
        ...[2, 3, 4, 5, 6].map((n) => {
          const day = addDays(today, n);
          return { label: weekdayName(weekdayOf(day)), insert: `${day.slice(8, 10)}.${day.slice(5, 7)}. `, hint: dayLabel(day, today, t) };
        }),
        { label: t("Diese Woche", "This week"), insert: `${word("this week", "diese woche")} ` },
        { label: t("Nächste Woche", "Next week"), insert: `${word("next week", "nächste woche")} ` },
        { label: t("Nächster Monat", "Next month"), insert: `${word("next month", "nächsten monat")} ` },
        { label: t("Irgendwann", "Someday"), insert: `${word("someday", "irgendwann")} ` },
      ];
    }
    case "!":
      return [
        { label: t("Hohe Priorität", "High priority"), insert: "!!! " },
        { label: t("Mittlere Priorität", "Medium priority"), insert: "!! " },
        { label: t("Niedrige Priorität", "Low priority"), insert: "! " },
      ];
    case "~":
      return [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ label: durationLabel(m, t), insert: m < 60 ? `~${m}m ` : `~${m / 60}h `.replace(".5h", "h30") }));
    case "*":
      return [
        { label: t("Jeden Tag", "Every day"), insert: "every day " },
        { label: t("Werktags", "Weekdays"), insert: "every weekday " },
        { label: t("Jede Woche", "Every week"), insert: "every week " },
        { label: t("Alle 2 Wochen", "Every 2 weeks"), insert: "every 2 weeks " },
        { label: t("Jeden Monat", "Every month"), insert: "every month " },
        { label: t("Jedes Jahr", "Every year"), insert: "every year " },
      ];
  }
}
// The symbol word the caret is in: "#tr|" → { symbol "#", query "tr", start }.
function symbolAt(text: string, caret: number): { symbol: Symbol; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)([#@!~*$])([^\s#@!~*$]*)$/u.exec(before);
  if (!m) return null;
  return { symbol: m[2] as Symbol, query: m[3], start: before.length - m[3].length - 1 };
}

// ---- The input ----

const ROLE_CLASS: Record<QuickRole, string> = { kind: "qa-kind", date: "qa-date", priority: "qa-priority", tag: "qa-tag", folder: "qa-folder", rhythm: "qa-rhythm", duration: "qa-duration", link: "qa-link" };

export function QuickAddInput({
  value,
  onChange,
  parsed,
  onSubmit,
  onEscape,
  placeholder,
  autoFocus,
  inputRef,
  label,
  className = "",
  onKeyDownCapture,
}: {
  value: string;
  onChange: (value: string) => void;
  parsed: QuickAdd;
  onSubmit: () => void;
  onEscape?: () => void;
  placeholder: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  label: string;
  className?: string;
  onKeyDownCapture?: (e: KeyboardEvent<HTMLInputElement>) => boolean;
}) {
  const t = useT();
  const { state, today } = usePlannerUi();
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const mirror = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const symbol = symbolAt(value, caret);
  const options = useMemo(() => {
    if (!symbol || closedAt === symbol.start) return [];
    const q = symbol.query.toLowerCase();
    return symbolOptions(symbol.symbol, t, state?.tags.map((x) => x.name) || [], state?.folders.map((f) => f.name) || [], today)
      .filter((o) => !q || o.label.toLowerCase().includes(q) || o.insert.toLowerCase().includes(q))
      .slice(0, 8);
  }, [symbol, closedAt, t, state?.tags, state?.folders, today]);
  const open = options.length > 0;
  useEffect(() => setActive(0), [symbol?.symbol, symbol?.query]);
  const sync = () => {
    const input = ref.current;
    if (!input) return;
    setCaret(input.selectionStart ?? input.value.length);
    if (mirror.current) mirror.current.scrollLeft = input.scrollLeft;
  };
  const insert = (option: Option) => {
    if (!symbol) return;
    const next = value.slice(0, symbol.start) + option.insert + value.slice(caret).replace(/^\S*/, "").replace(/^\s+/, "");
    onChange(next);
    const at = symbol.start + option.insert.length;
    // After the new value is drawn – unless typing went on meanwhile.
    requestAnimationFrame(() => {
      const input = ref.current;
      if (!input || input.value !== next) return;
      input.setSelectionRange(at, at);
      setCaret(at);
    });
  };
  // The text in parts, coloured by what the parser recognised.
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const span of parsed.spans) {
    if (span.start > at) pieces.push(value.slice(at, span.start));
    pieces.push(
      <mark key={span.start} className={ROLE_CLASS[span.role]}>
        {value.slice(span.start, span.end)}
      </mark>,
    );
    at = span.end;
  }
  pieces.push(value.slice(at));
  return (
    <div className={`qa-field ${className}`}>
      <div className="qa-mirror" ref={mirror} aria-hidden>
        {pieces}
        {"​"}
      </div>
      <input
        ref={ref}
        className="qa-input"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        spellCheck={false}
        autoComplete="off"
        maxLength={2000}
        onChange={(e) => {
          onChange(e.target.value);
          setClosedAt(null);
          requestAnimationFrame(sync);
        }}
        onSelect={sync}
        onScroll={sync}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (onKeyDownCapture?.(e)) return;
          if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
            return;
          }
          // Enter takes the suggestion – unless the word already is it
          // (then Enter creates); Tab always completes.
          const typed = symbol ? value.slice(symbol.start, caret).trim() : "";
          if (open && (e.key === "Tab" || (e.key === "Enter" && options[active]?.insert.trim() !== typed))) {
            e.preventDefault();
            insert(options[active]);
            return;
          }
          if (e.key === "Escape") {
            if (open && symbol) {
              e.preventDefault();
              e.stopPropagation();
              setClosedAt(symbol.start);
              return;
            }
            onEscape?.();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {open && (
        <ul className="qa-menu" id={listId} role="listbox" aria-label={t("Vorschläge", "Suggestions")}>
          {options.map((o, i) => (
            <li
              key={o.label + i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(o);
              }}
            >
              <span>{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The badge of the kind: what the sentence makes; a click fixes the next kind.
export function KindBadge({ kind, fixed, onPick }: { kind: QuickKind; fixed: boolean; onPick: (kind: QuickKind | undefined) => void }) {
  const t = useT();
  const Icon = KIND_ICON[kind];
  return (
    <button
      type="button"
      className={`qa-badge kind-${kind}${fixed ? " is-fixed" : ""}`}
      onClick={() => onPick(KIND_ORDER[(KIND_ORDER.indexOf(kind) + 1) % KIND_ORDER.length])}
      onContextMenu={(e) => {
        e.preventDefault();
        onPick(undefined);
      }}
      title={fixed ? t("Art festgelegt – klicken zum Wechseln", "Kind fixed – click to switch") : t("Art erkannt – klicken zum Festlegen", "Kind detected – click to choose")}
      aria-label={t(`Art: ${kindLabel(kind, t)}`, `Kind: ${kindLabel(kind, t)}`)}
    >
      <Icon size={14} strokeWidth={2.75} aria-hidden />
      {kindLabel(kind, t)}
    </button>
  );
}

// What Enter creates, in words and chips.
export function CreateSummary({ parsed }: { parsed: QuickAdd }) {
  const t = useT();
  const { today, state } = usePlannerUi();
  const chips: ReactNode[] = [];
  if (parsed.period?.kind === "someday") chips.push(t("Irgendwann", "Someday"));
  else if (parsed.period?.kind === "week") chips.push(weekLabel(parsed.period.start, today, t, state?.settings.weekStart ?? 1));
  else if (parsed.period?.kind === "month") chips.push(monthLabel(parsed.period.start, today, t));
  else if (parsed.date) chips.push(dayLabel(parsed.date, today, t));
  if (parsed.kind === "event" && parsed.allDay) chips.push(t("Ganztägig", "All day"));
  else if (parsed.time) chips.push(parsed.end ? `${timeLabel(parsed.time)}–${timeLabel(parsed.end)}` : timeLabel(parsed.time));
  if (parsed.rhythm) chips.push(ruleLabel(ruleFromRhythm(parsed.rhythm), t, weekdayName, state?.settings.weekStart ?? 1));
  if (parsed.priority) chips.push(["", t("Niedrig", "Low"), t("Mittel", "Medium"), t("Hoch", "High")][parsed.priority]);
  if (parsed.duration && parsed.kind !== "event") chips.push(durationLabel(parsed.duration, t));
  if (parsed.folder) chips.push(parsed.folder);
  for (const tag of parsed.tags) chips.push(`#${tag}`);
  return (
    <span className="qa-summary">
      {chips.map((c, i) => (
        <span key={i} className="qa-chip">
          {c}
        </span>
      ))}
    </span>
  );
}

// The day around a timed item: its events as grey blocks, the new one in
// its kind's colour.
export function DayTimeline({ parsed }: { parsed: QuickAdd }) {
  const t = useT();
  const { state, today } = usePlannerUi();
  if (!parsed.time || parsed.kind === "note") return null;
  const day = parsed.date || today;
  const start = minutesOf(parsed.time);
  const length = parsed.kind === "event" && parsed.end ? Math.max(15, (minutesOf(parsed.end) - start + 1440) % 1440 || 60) : parsed.duration || 30;
  const from = Math.max(0, Math.min(Math.floor(start / 60) - 2, 18)) * 60;
  const to = from + 8 * 60;
  const pct = (m: number) => `${(Math.max(0, Math.min(to, m) - from) / (to - from)) * 100}%`;
  const others = (state?.items || []).filter((i: PlannerItem) => i.kind === "event" && !i.allDay && i.time && eventOnDay(i, day));
  const clash = others.find((o) => {
    const s = o.day === day ? minutesOf(o.time!) : 0;
    const e = o.endDay && o.endDay > day ? 1440 : o.endTime ? minutesOf(o.endTime) : s + 60;
    return s < start + length && e > start;
  });
  return (
    <div className="qa-timeline" aria-label={t("Der Tag um diese Zeit", "The day around this time")}>
      <div className="qa-timeline-track">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="qa-hour" style={{ left: pct(from + i * 60) }}>
            {hourLabel(from / 60 + i)}
          </span>
        ))}
        {others.map((o) => {
          const s = o.day === day ? minutesOf(o.time!) : 0;
          const e = o.endDay && o.endDay > day ? 1440 : o.endTime ? minutesOf(o.endTime) : s + 60;
          if (e <= from || s >= to) return null;
          return <span key={o.id} className="qa-block is-other" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} title={o.title} />;
        })}
        <span className={`qa-block kind-${parsed.kind}`} style={{ left: pct(start), width: `calc(${pct(start + length)} - ${pct(start)})` }} />
      </div>
      <small className={clash ? "qa-clash" : undefined}>{clash ? t(`Überschneidet sich mit „${clash.title}“`, `Overlaps “${clash.title}”`) : t("Frei zu dieser Zeit", "Free at this time")}</small>
    </div>
  );
}

// Creates what the sentence says; returns the item (notes open their page).
export function useQuickCreate() {
  const { store, state, openPage, select } = usePlannerUi();
  return async (parsed: QuickAdd, defaults: Partial<ItemDraft> = {}, options: { open?: boolean } = {}) => {
    if (!parsed.title.trim()) return null;
    const item = await store.create(draftOf(parsed, state?.folders || [], defaults));
    if (!item) return null;
    if (item.kind === "note" && item.pageId && options.open !== false) openPage(item.pageId);
    else if (options.open) select(item.id);
    return item;
  };
}

// The Quick Add dialog: ⌘N (task), ⇧⌘N (event), ⌥⌘N (note), the top bar's
// New and the manifest's shortcut.
export function QuickAddDialog({ request, onClose }: { request: QuickAddRequest; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState(request.text || "");
  const [kind, setKind] = useState<QuickKind | undefined>(request.kind);
  const parsed = useQuickParse(text, kind);
  const create = useQuickCreate();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (busy || !parsed.title.trim()) return;
    setBusy(true);
    const made = await create(parsed, request.defaults);
    setBusy(false);
    if (made) onClose();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    // A menu that opened it may hand the focus back to its button first.
    const again = window.setTimeout(() => input.current?.focus(), 0);
    return () => {
      window.clearTimeout(again);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="qa-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qa-dialog" role="dialog" aria-modal="true" aria-label={t("Schnell hinzufügen", "Quick add")} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="qa-line">
          <KindBadge kind={parsed.kind} fixed={!!kind} onPick={setKind} />
          <QuickAddInput
            value={text}
            onChange={setText}
            parsed={parsed}
            onSubmit={() => void submit()}
            onEscape={onClose}
            inputRef={input}
            autoFocus
            label={t("Was willst du hinzufügen?", "What do you want to add?")}
            placeholder={t("Anna anrufen morgen 10:00 #familie", "Call Anna tomorrow 10:00 #family")}
          />
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("Schließen", "Close")}>
            <X size={16} />
          </button>
        </div>
        {parsed.title.trim() ? (
          <button type="button" className="qa-create" onClick={() => void submit()} disabled={busy}>
            <span className={`qa-create-icon kind-${parsed.kind}`}>
              <Check size={14} strokeWidth={2.75} aria-hidden />
            </span>
            <span className="qa-create-text">
              {t(`${kindLabel(parsed.kind, t)} anlegen:`, `Create ${kindLabel(parsed.kind, t).toLowerCase()}:`)} <strong>{parsed.title}</strong>
            </span>
            <CreateSummary parsed={parsed} />
            <kbd>↵</kbd>
          </button>
        ) : (
          <p className="qa-help">
            <Hash size={12} aria-hidden /> {t("Tippe # @ ! ~ * $ für Tags, Tage, Priorität, Dauer, Wiederholung und Ordner.", "Type # @ ! ~ * $ for tags, days, priority, duration, repeat and folders.")}
          </p>
        )}
        <DayTimeline parsed={parsed} />
      </div>
    </div>
  );
}

// A capture line inside a screen ("Add a task" under a day): Quick Add with
// the place's defaults; stays open for the next one.
export function CaptureLine({ defaults, placeholder, kind }: { defaults?: Partial<ItemDraft>; placeholder?: string; kind?: QuickKind }) {
  const t = useT();
  const [text, setText] = useState("");
  const parsed = useQuickParse(text, kind);
  const create = useQuickCreate();
  const submit = async () => {
    if (!parsed.title.trim()) return;
    const value = text;
    setText("");
    if (!(await create(parsed, defaults, { open: false }))) setText(value);
  };
  return (
    <div className="db-capture">
      <span className={`db-capture-mark kind-${parsed.kind}`} aria-hidden />
      <QuickAddInput
        value={text}
        onChange={setText}
        parsed={parsed}
        onSubmit={() => void submit()}
        onEscape={() => setText("")}
        label={placeholder || t("Hinzufügen", "Add")}
        placeholder={placeholder || t("Hinzufügen …", "Add…")}
      />
      {text.trim() && <span className={`qa-badge kind-${parsed.kind} is-small`}>{kindLabel(parsed.kind, t)}</span>}
    </div>
  );
}

// The ⌘K palette's Create row (components/daybar/bridge.tsx): kind badge,
// title and what was read.
export function PaletteCreateLabel({ text }: { text: string }) {
  const t = useT();
  const parsed = useQuickParse(text, undefined);
  return (
    <span className="palette-create-label" aria-hidden>
      <span className={`qa-badge kind-${parsed.kind} is-small`}>{kindLabel(parsed.kind, t)}</span>
      <span className="palette-create-title">{t(`„${parsed.title || text}“ anlegen`, `Create “${parsed.title || text}”`)}</span>
      <CreateSummary parsed={parsed} />
    </span>
  );
}
