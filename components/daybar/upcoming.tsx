"use client";
// Upcoming: the next 30 days. As a board, one column per day – drag a card
// to another day and it keeps its time; a long day shows its first items
// and "Show more". As a list, the days with something on them.
import { useState } from "react";
import { Kanban, List } from "lucide-react";
import { useT } from "../i18n";
import { movedToDay, upcomingDays, type PlannerItem } from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { CaptureLine } from "./quick-add";
import { Empty, ItemRow, PlannerStatus } from "./parts";
import { dayLabel, dayMonth, weekdayShort } from "./format";
import { DRAG_TYPE, dropToDay } from "./today";

const SHOWN = 6;
type Layout = "board" | "list";
function remembered(key: string, fallback: Layout): Layout {
  try {
    const v = localStorage.getItem(key);
    return v === "board" || v === "list" ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function UpcomingScreen() {
  const t = useT();
  const { state, today, store } = usePlannerUi();
  const [layout, setLayout] = useState<Layout>(() => remembered("daybar-upcoming-layout", "board"));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  if (!state) return <PlannerStatus />;
  const days = upcomingDays(state.items, today, 30);
  const choose = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem("daybar-upcoming-layout", next);
    } catch {}
  };
  const move = (item: PlannerItem, day: string) => void store.update(item.id, movedToDay(item, day));
  const drag = (item: PlannerItem) => (e: React.DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(DRAG_TYPE, item.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div className={`db-screen db-upcoming is-${layout}`}>
      <header className="db-screen-head">
        <h1>{t("Demnächst", "Upcoming")}</h1>
        <div className="db-segmented" role="radiogroup" aria-label={t("Darstellung", "Layout")}>
          <button type="button" role="radio" aria-checked={layout === "board"} onClick={() => choose("board")}>
            <Kanban size={15} aria-hidden /> {t("Board", "Board")}
          </button>
          <button type="button" role="radio" aria-checked={layout === "list"} onClick={() => choose("list")}>
            <List size={15} aria-hidden /> {t("Liste", "List")}
          </button>
        </div>
      </header>
      {layout === "board" ? (
        <div className="db-board" role="list" aria-label={t("Die nächsten 30 Tage", "The next 30 days")}>
          {days.map(({ day, items }) => {
            const expanded = open.has(day);
            const shown = expanded ? items : items.slice(0, SHOWN);
            return (
              <section
                key={day}
                role="listitem"
                className={`db-column${day === today ? " is-today" : ""}${over === day ? " is-over" : ""}`}
                aria-label={dayLabel(day, today, t)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setOver(day);
                }}
                onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  dropToDay(e, day, state.items, move);
                }}
              >
                <header className="db-column-head">
                  <strong>{dayLabel(day, today, t)}</strong>
                  <span>{day === today || dayLabel(day, today, t) !== weekdayShort(day) ? `${weekdayShort(day)} ${dayMonth(day)}` : dayMonth(day)}</span>
                  {items.length > 0 && <span className="db-count">{items.length}</span>}
                </header>
                <div className="db-column-body">
                  {shown.map((item) => (
                    <ItemRow key={item.id} item={item} className="db-card-row" draggable={item.kind !== "note"} onDragStart={drag(item)} />
                  ))}
                  {items.length > SHOWN && (
                    <button type="button" className="db-link-button" onClick={() => setOpen((s) => new Set(expanded ? [...s].filter((d) => d !== day) : [...s, day]))}>
                      {expanded ? t("Weniger anzeigen", "Show less") : t(`${items.length - SHOWN} weitere anzeigen`, `Show ${items.length - SHOWN} more`)}
                    </button>
                  )}
                </div>
                <CaptureLine defaults={{ day }} placeholder={t("Hinzufügen …", "Add…")} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="db-day-list">
          {days.filter((d) => d.items.length || d.day === today).length ? (
            days
              .filter((d) => d.items.length || d.day === today)
              .map(({ day, items }) => (
                <section
                  key={day}
                  className="db-day-group"
                  onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
                  onDrop={(e) => dropToDay(e, day, state.items, move)}
                >
                  <h2>
                    {dayLabel(day, today, t)} <span>{`${weekdayShort(day)} ${dayMonth(day)}`}</span>
                  </h2>
                  <div className="db-list">
                    {items.map((item) => (
                      <ItemRow key={item.id} item={item} draggable={item.kind !== "note"} onDragStart={drag(item)} />
                    ))}
                  </div>
                </section>
              ))
          ) : (
            <Empty title={t("Die nächsten 30 Tage sind frei.", "The next 30 days are free.")} />
          )}
          <CaptureLine placeholder={t("Hinzufügen … (mit Tag: „Freitag 10:00“)", "Add… (with a day: “Friday 10:00”)")} />
        </div>
      )}
    </div>
  );
}
