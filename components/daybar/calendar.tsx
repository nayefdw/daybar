"use client";
// The calendar: Day, Days (2–5 columns), Week and Month, the last view
// remembered. The time grid has an all-day band (all-day events, tasks
// without a time) and, in Week, a "This week" strip for whole-week tasks;
// Month has a "This month" strip. Click a slot for an hour-long event, drag
// down a column for one of that span; drag an item to move it and its
// lower edge to resize it, both in 15-minute steps; drop a task from the
// right panel onto a slot to schedule it. Delete removes the focused item
// (undo in the toast).
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "../i18n";
import { Select } from "../select";
import {
  addDays,
  addMonths,
  diffDays,
  eventOnDay,
  minutesOf,
  monthStart,
  movedToDay,
  taskInPeriod,
  taskOnDay,
  timeOf,
  weekStart,
  weekdayOf,
  type CalendarView,
  type PlannerItem,
} from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { Empty, ItemRow, PlannerStatus, TaskCheck } from "./parts";
import { dayLabel, dayMonth, dayNumber, hourLabel, monthYear, timeLabel, weekdayShort } from "./format";
import { DRAG_TYPE, dropToDay } from "./today";

const HOUR = 48;
const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (m: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, m));

type Segment = { item: PlannerItem; day: string; start: number; end: number; lane: number; lanes: number };
// The timed pieces of a day: events (a multi-day one per day) and timed tasks.
function segmentsOf(items: readonly PlannerItem[], day: string, today: string): Segment[] {
  const out: Omit<Segment, "lane" | "lanes">[] = [];
  for (const item of items) {
    if (item.deletedAt || item.parentId) continue;
    if (item.kind === "event" && !item.allDay && item.time && eventOnDay(item, day)) {
      const start = item.day === day ? minutesOf(item.time) : 0;
      const end = item.endDay && item.endDay > day ? 1440 : item.endTime ? minutesOf(item.endTime) : start + 60;
      out.push({ item, day, start, end: Math.max(end, start + SNAP) });
    } else if (item.kind === "task" && item.time && taskOnDay(item, day, today)) {
      const start = minutesOf(item.time);
      out.push({ item, day, start, end: Math.min(1440, start + (item.duration || 30)) });
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  // Lanes: overlapping pieces side by side, each cluster as wide as it needs.
  const placed: Segment[] = [];
  let cluster: Segment[] = [],
    clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((s) => s.lane + 1));
    for (const s of cluster) s.lanes = lanes;
    cluster = [];
  };
  for (const piece of out) {
    if (piece.start >= clusterEnd) close();
    const used = new Set(cluster.filter((s) => s.end > piece.start).map((s) => s.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const seg: Segment = { ...piece, lane, lanes: 1 };
    cluster.push(seg);
    placed.push(seg);
    clusterEnd = Math.max(clusterEnd, piece.end);
  }
  close();
  return placed;
}

type Drag =
  | { mode: "create"; day: string; from: number; to: number; moved: boolean; pointerId: number }
  | { mode: "move" | "resize"; item: PlannerItem; day: string; start: number; end: number; grabbedAt: number; originDay: string; originStart: number; moved: boolean; pointerId: number; x: number; y: number };

export default function CalendarScreen() {
  const t = useT();
  const { state, today, store, select, quickAdd } = usePlannerUi();
  const settings = state?.settings;
  const [view, setView] = useState<CalendarView>(settings?.calendarView ?? "week");
  const [count, setCount] = useState(settings?.calendarDays ?? 3);
  const [anchor, setAnchor] = useState(today);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A click right after an item was dragged is not a click on it.
  const dragged = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const weekStartsOn = settings?.weekStart ?? 1;
  const workStart = settings?.workStart ?? 8,
    workEnd = settings?.workEnd ?? 18;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (workStart - 0.5) * HOUR);
  }, [view, workStart]);
  const choose = (next: CalendarView, n = count) => {
    setView(next);
    setCount(n);
    if (settings && (settings.calendarView !== next || settings.calendarDays !== n)) void store.updateSettings({ calendarView: next, calendarDays: n });
  };
  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "days") return Array.from({ length: count }, (_, i) => addDays(anchor, i));
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor, weekStartsOn), i));
    const first = weekStart(monthStart(anchor), weekStartsOn);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [view, anchor, count, weekStartsOn]);
  if (!state || !settings) return <PlannerStatus />;
  const step = (dir: 1 | -1) =>
    setAnchor(view === "month" ? addMonths(monthStart(anchor), dir) : addDays(anchor, dir * (view === "day" ? 1 : view === "days" ? count : 7)));
  const title =
    view === "month"
      ? monthYear(anchor)
      : days.length === 1
        ? dayLabel(days[0], today, t) === weekdayShort(days[0]) ? `${weekdayShort(days[0])} ${dayMonth(days[0])}` : `${dayLabel(days[0], today, t)} · ${dayMonth(days[0])}`
        : `${dayMonth(days[0])} – ${dayMonth(days[days.length - 1])}`;
  const move = (item: PlannerItem, day: string) => void store.update(item.id, movedToDay(item, day));

  // ---- The time grid's pointer work ----
  const minuteAt = (el: HTMLElement, clientY: number) => clamp(snap(((clientY - el.getBoundingClientRect().top) / HOUR) * 60), 0, 1440);
  const columnAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const col = (el as HTMLElement).closest?.("[data-day]") as HTMLElement | null;
      if (col?.dataset.day) return col;
    }
    return null;
  };
  const startCreate = (e: ReactPointerEvent<HTMLDivElement>, day: string) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const m = minuteAt(e.currentTarget, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode: "create", day, from: m, to: m, moved: false, pointerId: e.pointerId });
  };
  const startItem = (e: ReactPointerEvent<HTMLElement>, seg: Segment, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType === "touch" && mode === "move") return;
    const col = (e.currentTarget as HTMLElement).closest("[data-day]") as HTMLElement;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, item: seg.item, day: seg.day, start: seg.start, end: seg.end, grabbedAt: minuteAt(col, e.clientY), originDay: seg.day, originStart: seg.start, moved: false, pointerId: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const col = columnAt(e.clientX, e.clientY);
    if (drag.mode === "create") {
      if (!col || col.dataset.day !== drag.day) return;
      const m = minuteAt(col, e.clientY);
      setDrag({ ...drag, to: m, moved: drag.moved || Math.abs(m - drag.from) >= SNAP });
      return;
    }
    const far = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4;
    if (!col) return;
    const m = minuteAt(col, e.clientY);
    if (drag.mode === "resize") setDrag({ ...drag, end: Math.max(drag.start + SNAP, m), moved: drag.moved || far });
    else {
      const length = drag.end - drag.start;
      const start = clamp(drag.originStart + (m - drag.grabbedAt), 0, 1440 - SNAP);
      setDrag({ ...drag, day: col.dataset.day!, start, end: start + length, moved: drag.moved || far });
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (drag.mode === "create") {
      const from = Math.min(drag.from, drag.to),
        to = drag.moved ? Math.max(drag.from, drag.to) : Math.min(1440, drag.from + settings.eventMinutes);
      const end = Math.max(to, from + SNAP);
      quickAdd({ kind: "event", defaults: { day: drag.day, time: timeOf(from), endDay: end >= 1440 ? addDays(drag.day, 1) : drag.day, endTime: timeOf(end % 1440) } });
      return;
    }
    if (!drag.moved) return;
    dragged.current = true;
    window.setTimeout(() => (dragged.current = false), 0);
    const item = drag.item;
    if (item.kind === "task") {
      if (drag.mode === "resize") void store.update(item.id, { duration: Math.max(SNAP, drag.end - drag.start) });
      else void store.update(item.id, { day: drag.day, time: timeOf(drag.start), period: null });
      return;
    }
    // An event keeps its length when moved; resized, its end moves.
    const startTotal = minutesOf(item.time!),
      endTotal = (item.endDay ? diffDays(item.day!, item.endDay) * 1440 : 0) + (item.endTime ? minutesOf(item.endTime) : startTotal + 60);
    if (drag.mode === "resize") {
      const endAbs = diffDays(item.day!, drag.day) * 1440 + drag.end;
      const total = Math.max(startTotal + SNAP, endAbs);
      void store.update(item.id, { endDay: addDays(item.day!, Math.floor(total / 1440)), endTime: timeOf(total % 1440) });
    } else {
      // The piece moved: the whole event moves by the same amount.
      const shift = diffDays(drag.originDay, drag.day) * 1440 + (drag.start - drag.originStart);
      const start = diffDays("2000-01-01", item.day!) * 1440 + startTotal + shift;
      const end = start + (endTotal - startTotal);
      const dayOf = (abs: number) => addDays("2000-01-01", Math.floor(abs / 1440));
      void store.update(item.id, { day: dayOf(start), time: timeOf(((start % 1440) + 1440) % 1440), endDay: dayOf(end), endTime: timeOf(((end % 1440) + 1440) % 1440) });
    }
  };
  const dropOnSlot = (e: React.DragEvent<HTMLDivElement>, day: string) => {
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    e.preventDefault();
    const m = minuteAt(e.currentTarget, e.clientY);
    if (item.kind === "task") void store.update(item.id, { day, time: timeOf(Math.min(m, 1440 - SNAP)), period: null, waitingUntil: null });
    else if (item.kind === "event" && item.time && !item.allDay) {
      const length = (item.endDay ? diffDays(item.day!, item.endDay) * 1440 : 0) + (item.endTime ? minutesOf(item.endTime) : minutesOf(item.time) + 60) - minutesOf(item.time);
      const end = m + length;
      void store.update(item.id, { day, time: timeOf(m), endDay: addDays(day, Math.floor(end / 1440)), endTime: timeOf(end % 1440) });
    } else move(item, day);
  };
  const removeKey = (e: React.KeyboardEvent, item: PlannerItem) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void store.remove(item.id, item.title);
    }
  };

  const header = (
    <header className="db-screen-head db-cal-head">
      <h1>{title}</h1>
      <div className="db-cal-nav">
        <button type="button" className="icon-button" aria-label={t("Zurück", "Previous")} onClick={() => step(-1)}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="button" onClick={() => setAnchor(today)}>
          {t("Heute", "Today")}
        </button>
        <button type="button" className="icon-button" aria-label={t("Weiter", "Next")} onClick={() => step(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="db-segmented" role="radiogroup" aria-label={t("Ansicht", "View")}>
        {(["day", "days", "week", "month"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => choose(v)}>
            {{ day: t("Tag", "Day"), days: t("Tage", "Days"), week: t("Woche", "Week"), month: t("Monat", "Month") }[v]}
          </button>
        ))}
      </div>
      {view === "days" && (
        <Select aria-label={t("Anzahl der Tage", "Number of days")} value={String(count)} onChange={(e) => choose("days", Number(e.target.value))}>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {t(`${n} Tage`, `${n} days`)}
            </option>
          ))}
        </Select>
      )}
    </header>
  );

  if (view === "month") {
    const monthTasks = state.items.filter((i) => taskInPeriod(i, anchor, weekStartsOn) && i.period === "month" && !i.doneAt);
    return (
      <div className="db-screen db-calendar is-month">
        {header}
        <div className="db-period-strip" aria-label={t("Dieser Monat", "This month")}>
          <strong>{t("Dieser Monat", "This month")}</strong>
          {monthTasks.length ? monthTasks.map((i) => <ItemRow key={i.id} item={i} className="db-chip-row-item" />) : <span className="db-hint">{t("Keine Aufgaben für den ganzen Monat.", "No tasks for the whole month.")}</span>}
        </div>
        <div className="db-month">
          {days.slice(0, 7).map((d) => (
            <div key={`h${d}`} className="db-month-wd" aria-hidden>
              {weekdayShort(d)}
            </div>
          ))}
          {days.map((d) => {
            const items = state.items
              .filter((i) => !i.parentId && (eventOnDay(i, d) || taskOnDay(i, d, today)))
              .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.time || "").localeCompare(b.time || ""));
            return (
              <div
                key={d}
                className={`db-month-cell${d.slice(0, 7) !== anchor.slice(0, 7) ? " is-outside" : ""}${d === today ? " is-today" : ""}${[0, 6].includes(weekdayOf(d)) ? " is-weekend" : ""}`}
                onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
                onDrop={(e) => dropToDay(e, d, state.items, move)}
                onDoubleClick={(e) => e.target === e.currentTarget && quickAdd({ defaults: { day: d } })}
              >
                <button type="button" className="db-month-day" onClick={() => [setAnchor(d), choose("day")]} aria-label={dayLabel(d, today, t)}>
                  {dayNumber(d)}
                </button>
                {items.slice(0, 3).map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className={`db-month-item kind-${i.kind}${i.doneAt ? " is-done" : ""}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)}
                    onClick={() => select(i.id)}
                    onKeyDown={(e) => removeKey(e, i)}
                  >
                    {i.time && !i.allDay && <span>{timeLabel(i.time)}</span>}
                    {i.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <button type="button" className="db-link-button" onClick={() => [setAnchor(d), choose("day")]}>
                    {t(`+${items.length - 3} weitere`, `+${items.length - 3} more`)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Day, Days, Week ----
  const span = { start: days[0], end: days[days.length - 1] };
  const allDayEvents = state.items.filter((i) => i.kind === "event" && !i.deletedAt && i.day && (i.allDay || !i.time) && (i.endDay || i.day) >= span.start && i.day <= span.end);
  const weekTasks = view === "week" ? state.items.filter((i) => taskInPeriod(i, days[0], weekStartsOn) && i.period === "week" && !i.doneAt) : [];
  const cols = `repeat(${days.length}, minmax(0, 1fr))`;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <div className={`db-screen db-calendar is-${view}`}>
      {header}
      {view === "week" && (
        <div className="db-period-strip" aria-label={t("Diese Woche", "This week")}>
          <strong>{t("Diese Woche", "This week")}</strong>
          {weekTasks.length ? weekTasks.map((i) => <ItemRow key={i.id} item={i} className="db-chip-row-item" />) : <span className="db-hint">{t("Keine Aufgaben für die ganze Woche.", "No tasks for the whole week.")}</span>}
        </div>
      )}
      <div className="db-grid-head" style={{ gridTemplateColumns: cols }}>
        {days.map((d) => (
          <button key={d} type="button" className={`db-grid-day${d === today ? " is-today" : ""}`} onClick={() => [setAnchor(d), choose("day")]}>
            <span>{weekdayShort(d)}</span>
            <strong>{dayNumber(d)}</strong>
          </button>
        ))}
      </div>
      <div className="db-allday" style={{ gridTemplateColumns: cols }} aria-label={t("Ganztägig", "All day")}>
        {allDayEvents.map((i, row) => {
          const from = Math.max(0, diffDays(span.start, i.day!)),
            to = Math.min(days.length - 1, diffDays(span.start, i.endDay && i.endDay > i.day! ? i.endDay : i.day!));
          return (
            <button
              key={i.id}
              type="button"
              className="db-allday-event kind-event"
              style={{ gridColumn: `${from + 1} / ${to + 2}`, gridRow: row + 1 }}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)}
              onClick={() => select(i.id)}
              onKeyDown={(e) => removeKey(e, i)}
            >
              {i.title}
            </button>
          );
        })}
        {days.map((d, col) => (
          <div
            key={d}
            className="db-allday-cell"
            style={{ gridColumn: col + 1, gridRow: `${allDayEvents.length + 1}` }}
            onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
            onDrop={(e) => {
              const item = state.items.find((i) => i.id === e.dataTransfer.getData(DRAG_TYPE));
              if (!item) return;
              e.preventDefault();
              void store.update(item.id, item.kind === "task" ? { day: d, time: null, period: null } : movedToDay(item, d));
            }}
          >
            {state.items
              .filter((i) => taskOnDay(i, d, today) && !i.time)
              .map((i) => (
                <div key={i.id} className={`db-allday-task${i.doneAt ? " is-done" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)}>
                  <TaskCheck item={i} onToggle={() => void store.setDone(i.id, !i.doneAt)} size={14} />
                  <button type="button" onClick={() => select(i.id)} onKeyDown={(e) => removeKey(e, i)}>
                    {i.title}
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="db-grid-scroll" ref={scroller}>
        <div className="db-grid" style={{ height: 24 * HOUR }}>
          <div className="db-hours" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {h ? hourLabel(h) : ""}
              </span>
            ))}
          </div>
          <div className="db-columns" style={{ gridTemplateColumns: cols }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
            {days.map((d) => {
              const segments = segmentsOf(state.items, d, today);
              return (
                <div
                  key={d}
                  data-day={d}
                  className={`db-col${[0, 6].includes(weekdayOf(d)) ? " is-weekend" : ""}${d === today ? " is-today" : ""}`}
                  style={{ "--work-top": `${workStart * HOUR}px`, "--work-bottom": `${workEnd * HOUR}px` } as React.CSSProperties}
                  onPointerDown={(e) => startCreate(e, d)}
                  onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
                  onDrop={(e) => dropOnSlot(e, d)}
                  title={t("Klicken oder ziehen, um einen Termin anzulegen", "Click or drag to create an event")}
                >
                  {d === today && <span className="db-now" style={{ top: (nowMinutes / 60) * HOUR }} aria-hidden />}
                  {segments.map((seg) => {
                    const live = drag && drag.mode !== "create" && drag.item.id === seg.item.id ? drag : null;
                    if (live && live.mode === "move" && live.day !== d) return null;
                    const start = live ? live.start : seg.start,
                      end = live ? (live.mode === "resize" && live.day === d ? live.end : live.end) : seg.end;
                    return (
                      <div
                        key={`${seg.item.id}-${d}`}
                        role="button"
                        tabIndex={0}
                        className={`db-block kind-${seg.item.kind}${seg.item.doneAt ? " is-done" : ""}${live ? " is-dragging" : ""}${end - start < 45 ? " is-short" : ""}`}
                        style={{ top: (start / 60) * HOUR, height: Math.max(18, ((end - start) / 60) * HOUR - 2), left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px)`, width: `calc(${100 / seg.lanes}% - 4px)` }}
                        onPointerDown={(e) => startItem(e, seg, "move")}
                        onClick={() => !dragged.current && select(seg.item.id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), select(seg.item.id)) : removeKey(e, seg.item))}
                        aria-label={`${seg.item.title}, ${timeLabel(timeOf(start))}–${timeLabel(timeOf(end % 1440))}`}
                      >
                        <strong>{seg.item.title}</strong>
                        <span>{`${timeLabel(timeOf(start))}–${timeLabel(timeOf(end % 1440))}`}</span>
                        <span className="db-block-resize" onPointerDown={(e) => startItem(e, seg, "resize")} aria-hidden />
                      </div>
                    );
                  })}
                  {drag && drag.mode === "move" && drag.day === d && !segments.some((s) => s.item.id === drag.item.id) && (
                    <div className={`db-block kind-${drag.item.kind} is-dragging`} style={{ top: (drag.start / 60) * HOUR, height: ((drag.end - drag.start) / 60) * HOUR - 2, left: 2, right: 2 }}>
                      <strong>{drag.item.title}</strong>
                    </div>
                  )}
                  {drag?.mode === "create" && drag.day === d && drag.moved && (
                    <div className="db-block is-ghost" style={{ top: (Math.min(drag.from, drag.to) / 60) * HOUR, height: (Math.max(SNAP, Math.abs(drag.to - drag.from)) / 60) * HOUR }}>
                      <span>{`${timeLabel(timeOf(Math.min(drag.from, drag.to)))}–${timeLabel(timeOf(Math.max(drag.from, drag.to) % 1440))}`}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!state.items.some((i) => i.kind === "event") && <Empty title={t("Noch keine Termine.", "No events yet.")} hint={t("Klicke in den Kalender oder zieh über eine Spalte.", "Click into the calendar or drag down a column.")} />}
    </div>
  );
}
