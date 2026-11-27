"use client";
// What the planner's parts share inside the workspace shell: the store,
// today, the open view, the item shown in the right panel, Quick Add, and
// the way to open a flowplan page (a note, a day note).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ItemKind, PlannerItem } from "@/lib/daybar/model";
import { tr } from "@/lib/locale-tag";
import { usePlanner, useToday, type ItemDraft, type PlannerStore } from "./store";
import type { MenuAt } from "./item-menu";
import { useUpdateNotice } from "./update-notice";

const QuickAddDialog = dynamic(() => import("./quick-add").then((m) => m.QuickAddDialog));
const ItemMenu = dynamic(() => import("./item-menu"));
const IconPanel = dynamic(() => import("./icon-picker").then((m) => m.IconPanel));

// Clicks here keep the selected item: items themselves, the right panel,
// menus, dialogs and pop-ups (they close on their own).
const KEEPS_SELECTION =
  "[data-item], .side-panel, #side-dock-root, .db-menu, .db-icon-panel, .qa-backdrop, [role='dialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], .planner-topbar, .toast, .notice";

export type QuickAddRequest = { kind?: ItemKind; text?: string; defaults?: Partial<ItemDraft> };
type PlannerUi = ReturnType<typeof usePlanner> & {
  workspaceId: string;
  today: string;
  // The planner's view (#plan/<view>) while a planner screen is open.
  view: string | null;
  go: (view: string) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  quickAdd: (request?: QuickAddRequest) => void;
  // The right-click menu of an item (components/daybar/item-menu.tsx).
  openMenu: (e: MouseEvent, item: PlannerItem) => void;
  openPage: (pageId: string) => void;
  // Notes need a private space: members who may write.
  canWritePages: boolean;
};
const Context = createContext<PlannerUi | null>(null);

export function PlannerProvider({
  workspaceId,
  view,
  openPage,
  canWritePages,
  children,
}: {
  workspaceId: string;
  view: string | null;
  openPage: (pageId: string) => void;
  canWritePages: boolean;
  children: ReactNode;
}) {
  const planner = usePlanner(workspaceId);
  const today = useToday();
  // "Daybar has been updated – Reload" (components/daybar/update-notice.ts).
  useUpdateNotice();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [request, setRequest] = useState<QuickAddRequest | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [iconFor, setIconFor] = useState<{ id: string; x: number; y: number } | null>(null);
  // The right panel was opened by selecting an item: clicking away closes it.
  const openedBySelection = useRef(false);
  const go = useCallback((next: string) => {
    location.hash = `plan/${next}`;
  }, []);
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id && !panelOpen) {
        openedBySelection.current = true;
        setPanelOpen(true);
      }
    },
    [panelOpen],
  );
  const showPanel = useCallback((open: boolean) => {
    openedBySelection.current = false;
    setPanelOpen(open);
  }, []);
  const deselect = useCallback(() => {
    setSelectedId(null);
    if (openedBySelection.current) {
      openedBySelection.current = false;
      setPanelOpen(false);
    }
  }, []);
  // A click anywhere else, or Escape, lets go of the selected item.
  useEffect(() => {
    if (!selectedId) return;
    const away = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(KEEPS_SELECTION)) return;
      deselect();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const focus = document.activeElement;
      if (focus?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      deselect();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key);
    };
  }, [selectedId, deselect]);
  const quickAdd = useCallback((r: QuickAddRequest = {}) => setRequest(r), []);
  const openMenu = useCallback((e: MouseEvent, item: PlannerItem) => {
    e.preventDefault();
    e.stopPropagation();
    // From the keyboard (the menu key, Shift+F10) there is no pointer.
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ item, x: e.clientX || box.left + 16, y: e.clientY || box.bottom });
  }, []);
  const value = useMemo<PlannerUi>(
    () => ({ ...planner, workspaceId, today, view, go, selectedId, select, panelOpen, setPanelOpen: showPanel, quickAdd, openMenu, openPage, canWritePages }),
    [planner, workspaceId, today, view, go, selectedId, select, panelOpen, showPanel, quickAdd, openMenu, openPage, canWritePages],
  );
  const iconItem = iconFor ? planner.state?.items.find((i) => i.id === iconFor.id) : undefined;
  return (
    <Context.Provider value={value}>
      {children}
      {request && <QuickAddDialog request={request} onClose={() => setRequest(null)} />}
      {menu && <ItemMenu at={menu} onClose={() => setMenu(null)} onChooseIcon={(x, y) => setIconFor({ id: menu.item.id, x, y })} />}
      {iconFor && iconItem && (
        <IconPanel
          anchor={() => new DOMRect(iconFor.x, iconFor.y, 0, 0)}
          value={iconItem.icon}
          label={tr(`Symbol für „${iconItem.title}“`, `Icon for “${iconItem.title}”`)}
          onPick={(icon) => {
            setIconFor(null);
            if (icon !== iconItem.icon) void planner.store.update(iconItem.id, { icon });
          }}
          onClose={() => setIconFor(null)}
        />
      )}
    </Context.Provider>
  );
}
export function usePlannerUi() {
  const value = useContext(Context);
  if (!value) throw new Error("usePlannerUi outside PlannerProvider");
  return value;
}
// Outside the planner (a page of flowplan): null.
export const usePlannerUiMaybe = () => useContext(Context);
export type { PlannerStore };
