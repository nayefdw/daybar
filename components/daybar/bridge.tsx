"use client";
// How the workspace shell (components/workspace-app.tsx) reaches the
// planner: its shortcuts open Quick Add, and the ⌘K palette's Create row
// makes what was typed. The parser and the row's look load on first use, so
// the shell carries neither.
import { useEffect, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useT } from "../i18n";
import { PAGE_LOCALE } from "@/lib/locale-tag";
import { usePlannerUi, type QuickAddRequest } from "./context";

export type PlannerBridgeApi = {
  quickAdd: (request?: QuickAddRequest) => void;
  createFromText: (text: string) => Promise<boolean>;
  ready: boolean;
};

export function PlannerBridge({ apiRef }: { apiRef: RefObject<PlannerBridgeApi | null> }) {
  const { quickAdd, store, state, today, openPage, status } = usePlannerUi();
  useEffect(() => {
    apiRef.current = {
      quickAdd,
      ready: status === "ready",
      createFromText: async (text: string) => {
        if (!state) return false;
        const [{ parseQuickAdd }, { draftOf }] = await Promise.all([import("@/lib/daybar/quick-add"), import("./quick-add")]);
        const parsed = parseQuickAdd(text, {
          today,
          locale: PAGE_LOCALE,
          folders: state.folders.map((f) => f.name),
          weekStartsOn: state.settings.weekStart,
          eventMinutes: state.settings.eventMinutes,
        });
        if (!parsed.title.trim()) return false;
        const item = await store.create(draftOf(parsed, state.folders));
        if (item?.kind === "note" && item.pageId) openPage(item.pageId);
        return !!item;
      },
    };
  }, [apiRef, quickAdd, store, state, today, openPage, status]);
  return null;
}

const CreateLabel = dynamic(() => import("./quick-add").then((m) => m.PaletteCreateLabel), {
  loading: () => null,
});
// The Create row of the ⌘K palette: the kind, the title and what Quick Add
// read in the text.
export function PaletteCreateRow({ text }: { text: string }) {
  const t = useT();
  return (
    <span className="palette-create">
      <CreateLabel text={text} />
      <span className="sr-only">{t(`Erstellen: ${text}`, `Create: ${text}`)}</span>
    </span>
  );
}
