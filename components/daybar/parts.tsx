"use client";
// The pieces every planner screen shows: the checkbox (in the priority's
// colour, a ring for subtasks, half filled while in progress), an item's row
// with its badges, a section heading and the empty state.
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { Bell, CalendarBlank, Check, Hourglass, LinkSimple, MapPin, NoteBlank, Repeat, Star } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { isFollowUp, isWaiting, subtaskProgress, taskDay, type PlannerItem } from "@/lib/daybar/model";
import { countdown, dayLabel, durationLabel, spanLabel, timeLabel } from "./format";
import { usePlannerUi } from "./context";

export const PRIORITY_CLASS = ["", "pri-low", "pri-medium", "pri-high"] as const;
type T = (de: string, en: string) => string;
export const priorityName = (p: number, t: T) => [t("Keine", "None"), t("Niedrig", "Low"), t("Mittel", "Medium"), t("Hoch", "High")][p] ?? "";
export const kindName = (kind: PlannerItem["kind"], t: T) =>
  ({ task: t("Aufgabe", "Task"), event: t("Termin", "Event"), note: t("Notiz", "Note"), habit: t("Gewohnheit", "Habit") })[kind];

// A task's checkbox: the priority's colour, a progress ring with subtasks.
export function TaskCheck({ item, onToggle, size = 18 }: { item: PlannerItem; onToggle: () => void; size?: number }) {
  const t = useT();
  const { state } = usePlannerUi();
  const progress = state ? subtaskProgress(state.items, item.id) : { done: 0, total: 0 };
  const done = !!item.doneAt;
  const style = { "--size": `${size}px`, "--progress": progress.total ? `${(progress.done / progress.total) * 360}deg` : "0deg" } as CSSProperties;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      className={`db-check ${PRIORITY_CLASS[item.priority]}${progress.total && !done ? " has-progress" : ""}${item.inProgress && !done ? " in-progress" : ""}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? t(`„${item.title}“ wieder öffnen`, `Reopen “${item.title}”`) : t(`„${item.title}“ erledigen`, `Complete “${item.title}”`)}
      title={progress.total ? t(`${progress.done} von ${progress.total} Unteraufgaben erledigt`, `${progress.done} of ${progress.total} subtasks done`) : undefined}
    >
      {done && <Check size={size - 6} weight="bold" aria-hidden />}
    </button>
  );
}

// The marker in front of an item: a checkbox for tasks, a coloured mark for
// the other kinds.
export function ItemMark({ item }: { item: PlannerItem }) {
  const { store } = usePlannerUi();
  if (item.kind === "task") return <TaskCheck item={item} onToggle={() => void store.setDone(item.id, !item.doneAt)} />;
  if (item.kind === "event") return <span className="db-mark kind-event" aria-hidden />;
  if (item.kind === "note") return <NoteBlank className="db-mark-icon kind-note" size={17} aria-hidden />;
  return <Repeat className="db-mark-icon kind-habit" size={17} aria-hidden />;
}

// The badges under an item's title.
export function ItemMeta({ item, showDay = false, hideTime = false }: { item: PlannerItem; showDay?: boolean; hideTime?: boolean }) {
  const t = useT();
  const { state, today } = usePlannerUi();
  const folder = item.folderId ? state?.folders.find((f) => f.id === item.folderId) : null;
  const tags = item.tags.map((id) => state?.tags.find((tag) => tag.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const progress = item.kind === "task" && state ? subtaskProgress(state.items, item.id) : { done: 0, total: 0 };
  const day = item.kind === "task" ? taskDay(item) : item.day;
  const parts: ReactNode[] = [];
  if (item.kind === "event") parts.push(<span key="time">{showDay && item.day ? `${dayLabel(item.day, today, t)} · ` : ""}{spanLabel(item, today, t)}</span>);
  else {
    if (showDay && day) parts.push(<span key="day" className={item.kind === "task" && !item.doneAt && day < today ? "db-overdue" : undefined}>{dayLabel(day, today, t)}</span>);
    if (item.time && !hideTime) parts.push(<span key="time">{timeLabel(item.time)}</span>);
  }
  if (item.duration) parts.push(<span key="dur">{durationLabel(item.duration, t)}</span>);
  if (progress.total) parts.push(<span key="sub" className="db-badge">{`${progress.done}/${progress.total}`}</span>);
  if (item.inProgress && !item.doneAt) parts.push(<span key="prog" className="db-badge db-badge-progress">{t("In Arbeit", "In progress")}</span>);
  if (item.kind === "task" && isWaiting(item, today))
    parts.push(
      <span key="wait" className="db-badge db-badge-wait">
        <Hourglass size={12} aria-hidden />
        {countdown(item.waitingUntil!, today, t)}
      </span>,
    );
  else if (item.kind === "task" && isFollowUp(item, today) && !item.doneAt) parts.push(<span key="fu" className="db-badge db-badge-followup">{t(`Nachfassen #${item.followUps}`, `Follow-up #${item.followUps}`)}</span>);
  if (item.remindAt) parts.push(<Bell key="remind" size={12} aria-label={t("Erinnerung", "Reminder")} />);
  if (item.location) parts.push(<span key="loc" className="db-meta-icon"><MapPin size={12} aria-hidden />{item.location}</span>);
  if (item.link) parts.push(<LinkSimple key="link" size={12} aria-label={t("Link", "Link")} />);
  if (folder) parts.push(<span key="folder" className={`db-folder opt-${folder.color}`}>{folder.name}</span>);
  for (const tag of tags) parts.push(<span key={`tag-${tag.id}`} className="db-tag">#{tag.name}</span>);
  if (item.favorite) parts.push(<Star key="fav" size={12} weight="fill" className="db-fav" aria-label={t("Favorit", "Favourite")} />);
  if (!parts.length) return null;
  return <span className="db-meta">{parts}</span>;
}

// One item as a row: its mark, title and badges; the title opens it in the
// right panel. Draggable where the screen allows moving items to a day.
export function ItemRow({
  item,
  showDay,
  draggable,
  onDragStart,
  className = "",
  trailing,
  hideTime,
}: {
  item: PlannerItem;
  showDay?: boolean;
  // Where a time column shows it already (Today's lines).
  hideTime?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  className?: string;
  trailing?: ReactNode;
}) {
  const { select, selectedId } = usePlannerUi();
  return (
    <div
      className={`db-row kind-${item.kind}${item.doneAt ? " is-done" : ""}${selectedId === item.id ? " is-selected" : ""} ${className}`}
      draggable={draggable}
      onDragStart={onDragStart}
      data-item={item.id}
    >
      <ItemMark item={item} />
      <button type="button" className="db-row-main" onClick={() => select(item.id)}>
        <span className="db-row-title">{item.title || "…"}</span>
        <ItemMeta item={item} showDay={showDay} hideTime={hideTime} />
      </button>
      {trailing}
    </div>
  );
}

export function Section({ title, count, actions, children, className = "" }: { title: ReactNode; count?: number; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`db-section ${className}`}>
      <header className="db-section-head">
        <h2>{title}</h2>
        {count !== undefined && <span className="db-count">{count}</span>}
        {actions && <span className="db-section-actions">{actions}</span>}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, hint, icon }: { title: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="db-empty">
      {icon ?? <CalendarBlank size={22} aria-hidden />}
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

// Loading and failure of the planner itself.
export function PlannerStatus() {
  const t = useT();
  const { status, error, store } = usePlannerUi();
  if (status === "loading")
    return (
      <div className="db-loading" role="status">
        {t("Planer wird geladen …", "Loading the planner…")}
      </div>
    );
  if (status === "error")
    return (
      <div className="db-loading" role="alert">
        <span>{error || t("Der Planer konnte nicht geladen werden.", "The planner could not be loaded.")}</span>
        <button type="button" className="button" onClick={() => void store.load(true)}>
          {t("Erneut versuchen", "Try again")}
        </button>
      </div>
    );
  return null;
}
