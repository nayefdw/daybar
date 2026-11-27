"use client";
// Today: a day strip (each day a drop target), "Good morning, you have …",
// the week's whole-week tasks, the day note – the day's items as lines, a
// capture line for the day and the journal's text – and what is left from
// earlier days with "Move to today" and "Move all".
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { ChosenIcon } from "./item-icon";
import { useT } from "../i18n";
import { api } from "../ui";
import { showToast } from "../toast";
import { addDays, isOverdue, itemsOnDay, movedToDay, taskDay, taskInPeriod, weekStart, type PlannerItem } from "@/lib/daybar/model";
import { habitDue } from "@/lib/daybar/repeat";
import { usePlannerUi } from "./context";
import { CaptureLine } from "./quick-add";
import { Empty, ItemMeta, ItemRow, PlannerStatus, Section } from "./parts";
import { dayLabel, dayNumber, fullDay, timeLabel, weekdayShort } from "./format";
import { checkinsOf } from "./store";

export const DRAG_TYPE = "application/x-daybar-item";
export function dropToDay(e: DragEvent, day: string, items: readonly PlannerItem[], move: (item: PlannerItem, day: string) => void) {
  const id = e.dataTransfer.getData(DRAG_TYPE);
  const item = items.find((i) => i.id === id);
  if (!item) return;
  e.preventDefault();
  move(item, day);
}

export default function TodayScreen() {
  const t = useT();
  const ui = usePlannerUi();
  const { state, today, store, workspaceId, openPage } = ui;
  const [day, setDay] = useState(today);
  const [stripStart, setStripStart] = useState(() => addDays(today, -3));
  const [notes, setNotes] = useState<Record<string, { pageId: string; text: string }>>({});
  const [opening, setOpening] = useState(false);
  useEffect(() => setDay(today), [today]);
  useEffect(() => {
    let live = true;
    api<Record<string, { pageId: string; text: string }>>(`/api/planner/day-notes?workspace=${workspaceId}&from=${day}&to=${day}`)
      .then((n) => live && setNotes((all) => ({ ...all, ...n })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [day, workspaceId, state?.settings.journalId]);
  const weekStartsOn = state?.settings.weekStart ?? 1;
  const due = useMemo(() => {
    if (!state) return () => false;
    const logs = new Map<string, Map<string, boolean>>();
    return (habit: PlannerItem, d: string) => {
      if (!logs.has(habit.id)) logs.set(habit.id, checkinsOf(state.logs, habit.id));
      return habitDue(habit, d, logs.get(habit.id), weekStartsOn);
    };
  }, [state, weekStartsOn]);
  if (!state) return <PlannerStatus />;
  const on = itemsOnDay(state.items, day, today, due);
  const openTasks = on.tasks.filter((i) => !i.doneAt);
  const leftovers = day === today ? state.items.filter((i) => isOverdue(i, today) && !i.parentId).sort((a, b) => (taskDay(a) || "").localeCompare(taskDay(b) || "")) : [];
  const weekTasks = state.items.filter((i) => taskInPeriod(i, day, weekStartsOn) && i.period === "week" && (!i.doneAt || i.doneDay === today));
  const move = (item: PlannerItem, to: string) => void store.update(item.id, movedToDay(item, to));
  const hour = new Date().getHours();
  const hello = hour < 12 ? t("Guten Morgen", "Good morning") : hour < 18 ? t("Guten Tag", "Good afternoon") : t("Guten Abend", "Good evening");
  const counts = t(
    `du hast ${on.events.length} ${on.events.length === 1 ? "Termin" : "Termine"} und ${openTasks.length} ${openTasks.length === 1 ? "Aufgabe" : "Aufgaben"}`,
    `you have ${on.events.length} ${on.events.length === 1 ? "event" : "events"} and ${openTasks.length} ${openTasks.length === 1 ? "task" : "tasks"}`,
  );
  const checkins = (habit: PlannerItem) => checkinsOf(state.logs, habit.id);
  const strip = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i));
  const note = notes[day];
  const openDayNote = async () => {
    if (note) return openPage(note.pageId);
    setOpening(true);
    try {
      const r = await store.dayNote(day);
      openPage(r.dayId || r.journalId);
    } catch (e) {
      showToast({ text: (e as Error).message, tone: "error" });
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="db-screen db-today">
      <header className="db-hero">
        <p className="db-greeting">
          {day === today ? `${hello}, ${counts}.` : `${dayLabel(day, today, t)}: ${counts}.`}
        </p>
        <h1>{fullDay(day, today)}</h1>
      </header>

      <nav className="db-daystrip" aria-label={t("Tage", "Days")}>
        <button type="button" className="icon-button" aria-label={t("Frühere Tage", "Earlier days")} onClick={() => setStripStart(addDays(stripStart, -7))}>
          <ChevronLeft size={16} />
        </button>
        {strip.map((d) => {
          const n = itemsOnDay(state.items, d, today, due);
          const count = n.events.length + n.tasks.filter((i) => !i.doneAt).length;
          return (
            <button
              key={d}
              type="button"
              className={`db-strip-cell${d === day ? " is-selected" : ""}${d === today ? " is-today" : ""}`}
              aria-current={d === day ? "date" : undefined}
              onClick={() => setDay(d)}
              onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
              onDrop={(e) => dropToDay(e, d, state.items, move)}
              title={dayLabel(d, today, t)}
            >
              <span className="db-strip-wd">{weekdayShort(d)}</span>
              <span className="db-strip-n">{dayNumber(d)}</span>
              <span className="db-strip-dots" aria-label={t(`${count} Einträge`, `${count} items`)}>
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </button>
          );
        })}
        <button type="button" className="icon-button" aria-label={t("Spätere Tage", "Later days")} onClick={() => setStripStart(addDays(stripStart, 7))}>
          <ChevronRight size={16} />
        </button>
        {day !== today && (
          <button type="button" className="button db-today-button" onClick={() => [setDay(today), setStripStart(addDays(today, -3))]}>
            {t("Heute", "Today")}
          </button>
        )}
      </nav>

      {leftovers.length > 0 && (
        <Section
          fold="today:leftovers"
          className="db-card db-leftovers"
          title={leftovers.every((i) => taskDay(i) === addDays(today, -1)) ? t("Von gestern noch offen", "From yesterday you still have") : t("Von früheren Tagen noch offen", "Still open from earlier days")}
          count={leftovers.length}
          actions={
            <button type="button" className="button" onClick={() => void store.updateMany(leftovers.map((i) => i.id), { day: today, period: null })}>
              {t("Alle verschieben", "Move all")}
            </button>
          }
        >
          <div className="db-list">
            {leftovers.slice(0, 20).map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                showDay
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)}
                trailing={
                  <button type="button" className="db-row-action" onClick={() => move(i, today)}>
                    <ArrowRight size={14} aria-hidden />
                    {t("Auf heute", "Move to today")}
                  </button>
                }
              />
            ))}
          </div>
        </Section>
      )}

      <Section fold="today:daynote" className="db-card db-daynote" title={day === today ? t("Tagesnotiz", "Day note") : t(`Tagesnotiz · ${dayLabel(day, today, t)}`, `Day note · ${dayLabel(day, today, t)}`)}>
        <ul className="db-lines" aria-label={t("Die Einträge des Tages", "The day's items")}>
          {/* In the order of the day: all-day events, then by time, then
              what has no time. */}
          {[...on.events, ...on.tasks, ...on.habits, ...on.notes]
            .sort((a, b) => {
              const at = a.allDay ? "" : a.time || "~",
                bt = b.allDay ? "" : b.time || "~";
              return at < bt ? -1 : at > bt ? 1 : 0;
            })
            .map((i) => {
              if (i.kind !== "habit")
                return (
                  <li key={i.id} className={`db-line kind-${i.kind}`}>
                    <span className="db-line-time">{i.kind === "event" && i.allDay ? t("ganztägig", "all day") : timeLabel(i.time)}</span>
                    <ItemRow item={i} hideTime draggable={i.kind !== "note"} onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)} />
                  </li>
                );
              const h = i;
              const done = checkins(h).has(day);
              return (
                <li key={h.id} className="db-line kind-habit">
                  <span className="db-line-time">{timeLabel(h.time)}</span>
                  <div className={`db-row kind-habit${done ? " is-done" : ""}`} data-item={h.id} onContextMenu={(e) => ui.openMenu(e, h)}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      className="db-check db-habit-check"
                      disabled={day > today}
                      onClick={() => void store.checkHabit(h.id, day, !done)}
                      aria-label={done ? t(`„${h.title}“ nicht abgehakt`, `Uncheck “${h.title}”`) : t(`„${h.title}“ abhaken`, `Check off “${h.title}”`)}
                    >
                      {done && <Check size={12} strokeWidth={2.75} aria-hidden />}
                    </button>
                    <button type="button" className="db-row-main" onClick={() => ui.select(h.id)}>
                      <span className="db-row-title">
                        {h.icon && <ChosenIcon name={h.icon} size={15} className="db-title-icon" />}
                        <span className="db-row-label">{h.title}</span>
                      </span>
                      <ItemMeta item={h} hideTime />
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
        {!on.events.length && !on.tasks.length && !on.habits.length && !on.notes.length && (
          <p className="db-hint">{t("Noch nichts an diesem Tag", "Nothing on this day yet")}</p>
        )}
        <CaptureLine defaults={{ day }} placeholder={t("Aufgabe, Termin um 9:00, Notiz …", "A task, an event at 9:00, a note…")} />
        <div className="db-daynote-text">
          {note?.text ? <p>{note.text}</p> : day > today && <p className="db-hint">{t("Tagesnotizen gibt es ab dem Tag selbst", "Day notes start on the day itself")}</p>}
          {day <= today && (
            <button type="button" className="db-quiet-button" disabled={opening} onClick={() => void openDayNote()}>
              <NotebookPen size={16} aria-hidden />
              {note ? t("Tagesnotiz öffnen", "Open day note") : t("Tagesnotiz schreiben", "Write a day note")}
            </button>
          )}
        </div>
      </Section>

      <Section fold="today:week" className="db-card db-week" title={t("Diese Woche", "This week")} count={weekTasks.length}>
        {weekTasks.length ? (
          <div className="db-list">
            {weekTasks.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        ) : (
          <p className="db-hint">{t("Aufgaben für die ganze Woche stehen hier", "Tasks for the whole week show here")}</p>
        )}
        <CaptureLine defaults={{ period: "week", day: weekStart(day, weekStartsOn) }} placeholder={t("Für diese Woche …", "For this week…")} kind="task" />
      </Section>
      {!state.items.length && <Empty title={t("Willkommen bei Daybar", "Welcome to Daybar")} hint={t("Drücke ⌘K oder ⌘N und tippe einen Satz: „Anna anrufen morgen 10:00“", "Press ⌘K or ⌘N and type a sentence: “Call Anna tomorrow 10:00”")} />}
    </div>
  );
}
