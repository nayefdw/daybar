"use client";
// What the planner's parts share inside the workspace shell: the store,
// today, the open view, the item shown in the right panel, Quick Add, and
// the way to open a flowplan page (a note, a day note).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ItemKind } from "@/lib/daybar/model";
import { usePlanner, useToday, type ItemDraft, type PlannerStore } from "./store";

const QuickAddDialog = dynamic(() => import("./quick-add").then((m) => m.QuickAddDialog));

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [request, setRequest] = useState<QuickAddRequest | null>(null);
  const go = useCallback((next: string) => {
    location.hash = `plan/${next}`;
  }, []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setPanelOpen(true);
  }, []);
  const quickAdd = useCallback((r: QuickAddRequest = {}) => setRequest(r), []);
  const value = useMemo<PlannerUi>(
    () => ({ ...planner, workspaceId, today, view, go, selectedId, select, panelOpen, setPanelOpen, quickAdd, openPage, canWritePages }),
    [planner, workspaceId, today, view, go, selectedId, select, panelOpen, quickAdd, openPage, canWritePages],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {request && <QuickAddDialog request={request} onClose={() => setRequest(null)} />}
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
