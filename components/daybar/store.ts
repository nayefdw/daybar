"use client";
// The planner in the browser: one store per workspace that loads the
// person's planner (/api/planner/state) and changes it at once – the screen
// shows a change before the server has it, the answer replaces it, a
// refusal loads the planner again and says why. Today is the browser's
// local day; it moves at midnight.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../ui";
import { showToast, showUndo } from "../toast";
import { tr } from "@/lib/locale-tag";
import { blankItem, localDay, type Folder, type HabitLog, type ItemKind, type PlannerItem, type PlannerSettings, type PlannerState, type Tag } from "@/lib/daybar/model";

export type ItemDraft = Partial<Omit<PlannerItem, "tags">> & { kind: ItemKind; title: string; tags?: string[] };
export type ItemPatch = Partial<Omit<PlannerItem, "tags" | "id">> & { tags?: string[] };
type Snapshot = { status: "loading" | "ready" | "error"; error: string | null; state: PlannerState | null };

const ENDPOINT = "/api/planner";
// The fields the server takes for an item (lib/daybar/store.ts itemFields).
const FIELDS = [
  "kind",
  "title",
  "body",
  "parentId",
  "day",
  "time",
  "endDay",
  "endTime",
  "allDay",
  "period",
  "duration",
  "priority",
  "inProgress",
  "waitingUntil",
  "location",
  "link",
  "remindAt",
  "repeat",
  "folderId",
  "tags",
  "favorite",
  "position",
] as const;
const pickFields = (o: Record<string, unknown>) => Object.fromEntries(FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export class PlannerStore {
  snapshot: Snapshot = { status: "loading", error: null, state: null };
  private listeners = new Set<() => void>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;
  constructor(readonly workspaceId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  private set(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const l of this.listeners) l();
  }
  private setState(change: (state: PlannerState) => PlannerState) {
    if (this.snapshot.state) this.set({ state: change(this.snapshot.state) });
  }
  get state() {
    return this.snapshot.state;
  }

  // ---- Loading ----

  load(force = false) {
    if (this.loading) return this.loading;
    if (!force && this.snapshot.status === "ready" && Date.now() - this.loadedAt < 15_000) return Promise.resolve();
    this.loading = (async () => {
      try {
        const state = await api<PlannerState>(`${ENDPOINT}/state?workspace=${encodeURIComponent(this.workspaceId)}&today=${localDay()}`);
        this.loadedAt = Date.now();
        this.set({ status: "ready", error: null, state });
      } catch (e) {
        if (!this.snapshot.state) this.set({ status: "error", error: (e as Error).message });
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
  private async send<T>(body: Record<string, unknown>): Promise<T> {
    return await api<T>(ENDPOINT, { workspaceId: this.workspaceId, today: localDay(), ...body });
  }
  // A refused change: the planner as the server has it, and why.
  private async failed(error: unknown) {
    showToast({ text: (error as Error).message || tr("Die Änderung wurde nicht gespeichert.", "The change was not saved."), tone: "error" });
    await this.load(true);
  }
  private replaceItems(items: PlannerItem[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    this.setState((s) => ({ ...s, items: [...s.items.filter((i) => !byId.has(i.id)), ...items] }));
  }
  // Tag names to ids for showing a change at once; new names wait for the answer.
  private tagIds(names: string[] | undefined) {
    if (!names) return undefined;
    const tags = this.state?.tags || [];
    return names.map((n) => tags.find((t) => t.name.toLowerCase() === n.replace(/^#/, "").toLowerCase())?.id).filter((x): x is string => !!x);
  }
  private knowsTags(names: string[] | undefined) {
    return !names || (this.tagIds(names)?.length ?? 0) === new Set(names.map((n) => n.replace(/^#/, "").toLowerCase())).size;
  }

  // ---- Items ----

  async create(draft: ItemDraft): Promise<PlannerItem | null> {
    const optimistic: PlannerItem = { ...blankItem(draft.kind), ...draft, tags: this.tagIds(draft.tags) || [] } as PlannerItem;
    this.setState((s) => ({ ...s, items: [...s.items, optimistic] }));
    try {
      const item = await this.send<PlannerItem>({ action: "item.create", item: { id: optimistic.id, ...pickFields(draft as Record<string, unknown>) } });
      this.replaceItems([item]);
      if (!this.knowsTags(draft.tags)) await this.load(true);
      return item;
    } catch (e) {
      await this.failed(e);
      return null;
    }
  }
  async update(id: string, patch: ItemPatch) {
    const before = this.state?.items.find((i) => i.id === id);
    if (!before) return;
    this.replaceItems([{ ...before, ...patch, tags: this.tagIds(patch.tags) ?? before.tags, updatedAt: Date.now() } as PlannerItem]);
    try {
      this.replaceItems([await this.send<PlannerItem>({ action: "item.update", id, patch: pickFields(patch as Record<string, unknown>) })]);
      if (!this.knowsTags(patch.tags)) await this.load(true);
    } catch (e) {
      await this.failed(e);
    }
  }
  async updateMany(ids: string[], patch: ItemPatch) {
    if (!ids.length) return;
    const items = this.state?.items.filter((i) => ids.includes(i.id)) || [];
    this.replaceItems(items.map((i) => ({ ...i, ...patch, tags: i.tags }) as PlannerItem));
    try {
      this.replaceItems(await this.send<PlannerItem[]>({ action: "items.update", ids, patch: pickFields(patch as Record<string, unknown>) }));
    } catch (e) {
      await this.failed(e);
    }
  }
  async setDone(id: string, done: boolean) {
    const before = this.state?.items.find((i) => i.id === id);
    if (!before) return;
    this.replaceItems([{ ...before, doneAt: done ? Date.now() : null, doneDay: done ? localDay() : null, inProgress: done ? false : before.inProgress }]);
    try {
      this.replaceItems([await this.send<PlannerItem>({ action: "item.done", id, done })]);
    } catch (e) {
      await this.failed(e);
    }
  }
  async remove(id: string, label?: string) {
    const items = this.state?.items || [];
    const gone = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const i of items) if (i.parentId && gone.has(i.parentId) && !gone.has(i.id)) [gone.add(i.id), (grew = true)];
    }
    this.setState((s) => ({ ...s, items: s.items.filter((i) => !gone.has(i.id)) }));
    try {
      await this.send({ action: "item.delete", id });
      showUndo(label ? tr(`„${label}“ gelöscht.`, `“${label}” deleted.`) : tr("Gelöscht.", "Deleted."), () => this.restore(id));
    } catch (e) {
      await this.failed(e);
    }
  }
  async restore(id: string) {
    try {
      await this.send({ action: "item.restore", id });
      await this.load(true);
    } catch (e) {
      await this.failed(e);
    }
  }
  async checkHabit(id: string, day: string, done: boolean) {
    const today = localDay();
    this.setState((s) => ({
      ...s,
      logs: done ? [...s.logs.filter((l) => !(l.itemId === id && l.day === day)), { itemId: id, day, onTime: day >= today }] : s.logs.filter((l) => !(l.itemId === id && l.day === day)),
    }));
    try {
      await this.send({ action: "habit.check", id, day, done });
    } catch (e) {
      await this.failed(e);
    }
  }

  // ---- Folders, tags, settings ----

  async createFolder(name: string, color = "gray") {
    try {
      const folder = await this.send<Folder>({ action: "folder.create", folder: { name, color } });
      this.setState((s) => ({ ...s, folders: [...s.folders, folder] }));
      return folder;
    } catch (e) {
      await this.failed(e);
      return null;
    }
  }
  async updateFolder(id: string, patch: Partial<Folder>) {
    this.setState((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
    try {
      await this.send({ action: "folder.update", id, patch });
    } catch (e) {
      await this.failed(e);
    }
  }
  async deleteFolder(id: string) {
    this.setState((s) => ({ ...s, folders: s.folders.filter((f) => f.id !== id), items: s.items.map((i) => (i.folderId === id ? { ...i, folderId: null } : i)) }));
    try {
      await this.send({ action: "folder.delete", id });
    } catch (e) {
      await this.failed(e);
    }
  }
  async createTag(name: string) {
    try {
      const tag = await this.send<Tag>({ action: "tag.create", tag: { name } });
      this.setState((s) => ({ ...s, tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag] }));
      return tag;
    } catch (e) {
      await this.failed(e);
      return null;
    }
  }
  async updateTag(id: string, patch: Partial<Tag>) {
    this.setState((s) => ({ ...s, tags: s.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    try {
      await this.send({ action: "tag.update", id, patch });
    } catch (e) {
      await this.failed(e);
    }
  }
  async deleteTag(id: string) {
    this.setState((s) => ({ ...s, tags: s.tags.filter((t) => t.id !== id), items: s.items.map((i) => ({ ...i, tags: i.tags.filter((t) => t !== id) })) }));
    try {
      await this.send({ action: "tag.delete", id });
    } catch (e) {
      await this.failed(e);
    }
  }
  async updateSettings(patch: Partial<PlannerSettings>) {
    this.setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    try {
      const settings = await this.send<PlannerSettings>({ action: "settings.update", patch });
      this.setState((s) => ({ ...s, settings }));
    } catch (e) {
      await this.failed(e);
    }
  }

  // ---- Day notes and imports ----

  async dayNote(day: string) {
    return await this.send<{ journalId: string; dayId: string | null }>({ action: "dayNote.open", day });
  }
  async importThisDay(exported: unknown, force = false) {
    const result = await this.send<{ status: "ok" | "old" | "held"; added?: number; updated?: number; removed?: number; adopted?: number; lastExport?: string }>({
      action: "thisday.import",
      export: exported,
      force,
    });
    await this.load(true);
    return result;
  }
  async importLegacy(backup: unknown) {
    const result = await this.send<{ added: number; updated: number; folders: number }>({ action: "legacy.import", backup });
    await this.load(true);
    return result;
  }
  async resendThisDay() {
    await this.send({ action: "thisday.resend" });
  }
}

const stores = new Map<string, PlannerStore>();
export function plannerStore(workspaceId: string) {
  let store = stores.get(workspaceId);
  if (!store) stores.set(workspaceId, (store = new PlannerStore(workspaceId)));
  return store;
}
const EMPTY: Snapshot = { status: "loading", error: null, state: null };
// The planner of the workspace, loaded on first use and again when the
// window comes back after a while (another device may have changed it).
export function usePlanner(workspaceId: string) {
  const store = plannerStore(workspaceId);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  useEffect(() => {
    void store.load();
    const again = () => document.visibilityState === "visible" && void store.load();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [store]);
  return useMemo(() => ({ store, ...snapshot }), [store, snapshot]);
}
// The local day, moving on at midnight (checked every minute).
export function useToday() {
  const [today, setToday] = useState(() => localDay());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}
// The check-ins of a habit as day → on time.
export function checkinsOf(logs: readonly HabitLog[], itemId: string) {
  return new Map(logs.filter((l) => l.itemId === itemId).map((l) => [l.day, l.onTime]));
}
