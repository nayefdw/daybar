"use client";
// The planner's part of the sidebar, above flowplan's spaces: Today,
// Upcoming, Calendar, Notes, Tasks, Events and Habits, then Favorites,
// Folders and Tags with five items each and "View all (N)".
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowsClockwise, CalendarBlank, CalendarCheck, CalendarDots, CaretRight, CheckSquare, Folder, NoteBlank, Plus, Repeat, Star, Sun, Tag } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { isOverdue, itemsOnDay } from "@/lib/daybar/model";
import { habitDue } from "@/lib/daybar/repeat";
import { usePlannerUi } from "./context";
import { checkinsOf } from "./store";

const SHOWN = 5;
type Fold = "favorites" | "folders" | "tags";
function readFolds(): Set<Fold> {
  try {
    return new Set(JSON.parse(localStorage.getItem("daybar-nav-folds") || "[]") as Fold[]);
  } catch {
    return new Set();
  }
}

export function PlannerNav({ active, onNavigate }: { active: string | null; onNavigate?: () => void }) {
  const t = useT();
  const { state, today, go, select } = usePlannerUi();
  const [folds, setFolds] = useState<Set<Fold>>(() => new Set());
  useEffect(() => setFolds(readFolds()), []);
  const toggle = (f: Fold) => {
    const next = new Set(folds);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setFolds(next);
    try {
      localStorage.setItem("daybar-nav-folds", JSON.stringify([...next]));
    } catch {}
  };
  const counts = useMemo(() => {
    if (!state) return { today: 0, tasks: 0, habits: 0 };
    const on = itemsOnDay(state.items, today, today, () => false);
    const overdue = state.items.filter((i) => isOverdue(i, today) && !i.parentId).length;
    const habits = state.items.filter((i) => i.kind === "habit" && !i.deletedAt).filter((h) => {
      const c = checkinsOf(state.logs, h.id);
      return habitDue(h, today, c, state.settings.weekStart) && !c.has(today);
    }).length;
    return { today: on.tasks.filter((i) => !i.doneAt).length + overdue, tasks: state.items.filter((i) => i.kind === "task" && !i.parentId && !i.doneAt && !i.deletedAt).length, habits };
  }, [state, today]);
  const open = (view: string) => {
    go(view);
    onNavigate?.();
  };
  const base = active?.split("/")[0] ?? null;
  const entry = (view: string, label: string, icon: ReactNode, count?: number) => (
    <button key={view} type="button" className={base === view ? "selected" : ""} aria-current={base === view ? "page" : undefined} onClick={() => open(view)}>
      {icon}
      <span className="main-nav-label">{label}</span>
      {!!count && <span className="notification-count planner-count">{count > 99 ? "99+" : count}</span>}
    </button>
  );
  const favorites = (state?.items || []).filter((i) => i.favorite && !i.deletedAt).sort((a, b) => (a.favoritePosition ?? 0) - (b.favoritePosition ?? 0));
  const section = (fold: Fold, title: string, icon: ReactNode, total: number, rows: ReactNode, all: string, add?: () => void) => (
    <section className={`nav-section planner-section${folds.has(fold) ? " space-collapsed" : ""}`} aria-label={title}>
      <div className="nav-section-title">
        <button type="button" className="space-toggle" aria-expanded={!folds.has(fold)} onClick={() => toggle(fold)}>
          <CaretRight size={10} className="space-caret" aria-hidden="true" />
          <span className="space-name">{title}</span>
          {icon}
        </button>
        {add && (
          <button type="button" className="icon-button planner-add" onClick={add} aria-label={t(`${title}: neu`, `${title}: new`)} title={t("Neu", "New")}>
            <Plus size={13} />
          </button>
        )}
      </div>
      {!folds.has(fold) && (
        <div className="space-tree">
          {rows}
          {total > SHOWN && (
            <button type="button" className="favorite-nav planner-all" onClick={() => open(all)}>
              <span>{t(`Alle anzeigen (${total})`, `View all (${total})`)}</span>
            </button>
          )}
          {!total && <span className="sidebar-empty">{t("Noch keine", "None yet")}</span>}
        </div>
      )}
    </section>
  );
  return (
    <div className="planner-nav">
      <nav className="main-nav planner-main" aria-label={t("Planer", "Planner")}>
        {entry("today", t("Heute", "Today"), <Sun size={19} />, counts.today)}
        {entry("upcoming", t("Demnächst", "Upcoming"), <CalendarDots size={19} />)}
        {entry("calendar", t("Kalender", "Calendar"), <CalendarBlank size={19} />)}
        {entry("notes", t("Notizen", "Notes"), <NoteBlank size={19} />)}
        {entry("tasks", t("Aufgaben", "Tasks"), <CheckSquare size={19} />, counts.tasks)}
        {entry("events", t("Termine", "Events"), <CalendarCheck size={19} />)}
        {entry("habits", t("Gewohnheiten", "Habits"), <Repeat size={19} />, counts.habits)}
      </nav>
      {section(
        "favorites",
        t("Favoriten", "Favourites"),
        <Star size={13} aria-hidden="true" />,
        favorites.length,
        favorites.slice(0, SHOWN).map((i) => (
          <button key={i.id} type="button" className="favorite-nav" onClick={() => [select(i.id), onNavigate?.()]}>
            <span className={`planner-dot kind-${i.kind}`} aria-hidden />
            <span>{i.title}</span>
          </button>
        )),
        "favorites",
      )}
      {section(
        "folders",
        t("Ordner", "Folders"),
        <Folder size={13} aria-hidden="true" />,
        state?.folders.length ?? 0,
        (state?.folders || []).slice(0, SHOWN).map((f) => (
          <button key={f.id} type="button" className={`favorite-nav${active === `folder/${f.id}` ? " selected" : ""}`} onClick={() => open(`folder/${f.id}`)}>
            <Folder size={16} weight="fill" className={`planner-folder opt-${f.color}`} aria-hidden />
            <span>{f.name}</span>
          </button>
        )),
        "folders",
        () => open("folders"),
      )}
      {section(
        "tags",
        t("Tags", "Tags"),
        <Tag size={13} aria-hidden="true" />,
        state?.tags.length ?? 0,
        (state?.tags || []).slice(0, SHOWN).map((x) => (
          <button key={x.id} type="button" className={`favorite-nav${active === `tag/${x.id}` ? " selected" : ""}`} onClick={() => open(`tag/${x.id}`)}>
            <span className="planner-hash" aria-hidden>
              #
            </span>
            <span>{x.name}</span>
          </button>
        )),
        "tags",
      )}
      <button type="button" className={`favorite-nav planner-sync${base === "sync" ? " selected" : ""}`} onClick={() => open("sync")}>
        <ArrowsClockwise size={16} aria-hidden />
        <span>{t("ThisDay und Import", "ThisDay and import")}</span>
      </button>
    </div>
  );
}
