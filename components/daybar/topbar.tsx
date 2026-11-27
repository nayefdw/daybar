"use client";
// The planner's top bar: "Search, or create anything…" (⌘K, the workspace's
// search with a Create row), New (a task, an event, a note, a habit – or a
// page of flowplan), AI and the right panel's switch. Back, forward and the
// sidebar button are the shell's (components/workspace-app.tsx).
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bot, Calendar, ChevronDown, CircleCheck, FilePlus, PanelRight, Plus, Repeat, Search, StickyNote } from "lucide-react";
import { useT } from "../i18n";
import { usePlannerUi } from "./context";

export function PlannerTopBar({
  onSearch,
  onAsk,
  onNewPage,
  searchHint,
  hint = () => "",
  canAsk,
  panelToggle = true,
}: {
  onSearch: () => void;
  onAsk?: () => void;
  onNewPage: () => void;
  searchHint?: string;
  // The combination of a shortcut on this device ("⌘N", "Ctrl + N").
  hint?: (action: "newTask" | "newEvent" | "newNote") => string;
  canAsk: boolean;
  // The right panel's switch (the planner's screens).
  panelToggle?: boolean;
}) {
  const t = useT();
  const { quickAdd, panelOpen, setPanelOpen, canWritePages } = usePlannerUi();
  return (
    <div className="planner-topbar">
      <button type="button" className="planner-search" onClick={onSearch}>
        <Search size={16} aria-hidden />
        <span>{t("Suchen oder erstellen …", "Search, or create anything…")}</span>
        {searchHint && <kbd>{searchHint}</kbd>}
      </button>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button type="button" className="button primary planner-new">
            <Plus size={15} aria-hidden />
            <span className="planner-new-label">{t("Neu", "New")}</span>
            <ChevronDown size={12} aria-hidden />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          {/* Focus goes to the Quick Add dialog, not back to the button. */}
          <Dropdown.Content className="dropdown" align="end" sideOffset={4} onCloseAutoFocus={(e) => e.preventDefault()}>
            <Dropdown.Item className="dropdown-item" onSelect={() => quickAdd({ kind: "task" })}>
              <CircleCheck className="kind-task-ink" />
              {t("Aufgabe", "Task")}
              {hint("newTask") && <span className="dropdown-shortcut">{hint("newTask")}</span>}
            </Dropdown.Item>
            <Dropdown.Item className="dropdown-item" onSelect={() => quickAdd({ kind: "event" })}>
              <Calendar className="kind-event-ink" />
              {t("Termin", "Event")}
              {hint("newEvent") && <span className="dropdown-shortcut">{hint("newEvent")}</span>}
            </Dropdown.Item>
            {canWritePages && (
              <Dropdown.Item className="dropdown-item" onSelect={() => quickAdd({ kind: "note" })}>
                <StickyNote className="kind-note-ink" />
                {t("Notiz", "Note")}
                {hint("newNote") && <span className="dropdown-shortcut">{hint("newNote")}</span>}
              </Dropdown.Item>
            )}
            <Dropdown.Item className="dropdown-item" onSelect={() => quickAdd({ kind: "habit" })}>
              <Repeat className="kind-habit-ink" />
              {t("Gewohnheit", "Habit")}
            </Dropdown.Item>
            {canWritePages && (
              <>
                <Dropdown.Separator className="dropdown-separator" />
                <Dropdown.Item className="dropdown-item" onSelect={onNewPage}>
                  <FilePlus />
                  {t("Seite, Datenbank oder Whiteboard …", "Page, database or whiteboard…")}
                </Dropdown.Item>
              </>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      {canAsk && onAsk && (
        <button type="button" className="icon-button" onClick={onAsk} aria-label={t("KI fragen", "Ask AI")} title={t("KI fragen", "Ask AI")}>
          <Bot size={18} />
        </button>
      )}
      {panelToggle && (
      <button
        type="button"
        className={`icon-button${panelOpen ? " is-on" : ""}`}
        aria-pressed={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={panelOpen ? t("Seitenleiste rechts schließen", "Close the right panel") : t("Seitenleiste rechts öffnen", "Open the right panel")}
        title={t("Rechte Seitenleiste", "Right panel")}
      >
        <PanelRight size={18} />
      </button>
      )}
    </div>
  );
}
