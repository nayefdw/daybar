"use client";
// The planner's right panel (flowplan's docked side panel, kind "planner"):
// a scope chosen in its title menu – Inbox (no date, no folder), All,
// Upcoming, Overdue, Waiting, Today, Calendar – lists items; an item opened
// anywhere in the planner shows its details here.
import { useRef, useState } from "react";
import { useFlip } from "./flip";
import { ArrowLeft } from "lucide-react";
import { useT } from "../i18n";
import { Select } from "../select";
import { SidePanel } from "../side-panel";
import { scopeItems, type PanelScope } from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { ItemDetails } from "./details";
import { CaptureLine } from "./quick-add";
import { Empty, ItemRow } from "./parts";

const SCOPES: PanelScope[] = ["inbox", "all", "upcoming", "overdue", "waiting", "today", "calendar"];
type T = (de: string, en: string) => string;
export const scopeName = (scope: PanelScope, t: T) =>
  ({
    inbox: t("Eingang", "Inbox"),
    all: t("Alle", "All"),
    upcoming: t("Demnächst", "Upcoming"),
    overdue: t("Überfällig", "Overdue"),
    waiting: t("Wartet", "Waiting"),
    today: t("Heute", "Today"),
    calendar: t("Zum Einplanen", "To schedule"),
  })[scope];

export function PlannerPanel() {
  const t = useT();
  const { state, today, selectedId, select, setPanelOpen } = usePlannerUi();
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef);
  const [scope, setScope] = useState<PanelScope>(() => {
    try {
      const saved = localStorage.getItem("daybar-panel-scope") as PanelScope | null;
      return saved && SCOPES.includes(saved) ? saved : "inbox";
    } catch {
      return "inbox";
    }
  });
  const pick = (next: PanelScope) => {
    setScope(next);
    try {
      localStorage.setItem("daybar-panel-scope", next);
    } catch {}
  };
  const item = selectedId ? state?.items.find((i) => i.id === selectedId && !i.deletedAt) : null;
  const close = () => {
    select(null);
    setPanelOpen(false);
  };
  const list = state ? scopeItems(state.items, scope, today) : [];
  return (
    <SidePanel
      kind="planner"
      owner="planner"
      label={t("Planer-Seitenleiste", "Planner panel")}
      onClose={close}
      autoFocus={false}
      title={
        item ? (
          <button type="button" className="db-panel-back" onClick={() => select(null)}>
            <ArrowLeft size={16} aria-hidden />
            {scopeName(scope, t)}
          </button>
        ) : (
          <Select aria-label={t("Bereich", "Scope")} className="db-scope" value={scope} onChange={(e) => pick(e.target.value as PanelScope)}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {scopeName(s, t)}
              </option>
            ))}
          </Select>
        )
      }
    >
      <div className="db-panel" ref={listRef}>
        {item ? (
          <ItemDetails key={item.id} item={item} onClose={() => select(null)} />
        ) : (
          <>
            {scope === "inbox" && <CaptureLine placeholder={t("In den Eingang …", "Add to Inbox…")} />}
            {scope === "calendar" && <p className="db-hint">{t("Zieh eine Aufgabe auf einen Tag oder eine Uhrzeit im Kalender.", "Drag a task onto a day or a time in the calendar.")}</p>}
            {list.length ? (
              <div className="db-list">
                {list.map((i) => (
                  <ItemRow
                    key={i.id}
                    item={i}
                    showDay={scope !== "today"}
                    draggable={i.kind === "task" || i.kind === "event"}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-daybar-item", i.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  />
                ))}
              </div>
            ) : (
              <Empty title={t("Hier ist nichts.", "Nothing here.")} hint={scope === "inbox" ? t("Was ohne Datum und Ordner hinzukommt, landet hier.", "What you add without a date or folder lands here.") : undefined} />
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
}
