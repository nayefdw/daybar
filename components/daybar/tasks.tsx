"use client";
// Tasks: grouped by default into Inbox, Overdue, each day, weeks and
// months, Waiting, Someday and Done; or by priority, folder or tag. As a
// list, a board (one column per group; drop on a day to move there) or a
// table. Sorted by time, priority, title or creation; filtered by text,
// priority, folder and tag, the filters shown as pills.
import { useMemo, useState } from "react";
import { Kanban, List, Table, X } from "lucide-react";
import { useT } from "../i18n";
import { Select } from "../select";
import { addDays, monthStart, movedToDay, taskDay, taskGroups, weekStart, type PlannerItem, type TaskGroup } from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { CaptureLine } from "./quick-add";
import { Empty, ItemMeta, ItemRow, PlannerStatus, TaskCheck, priorityName } from "./parts";
import { dayLabel, monthLabel, timeLabel, weekLabel } from "./format";
import { DRAG_TYPE } from "./today";

type Layout = "list" | "board" | "table";
type GroupBy = "when" | "priority" | "folder" | "tag" | "none";
type SortBy = "default" | "priority" | "title" | "created";
type Group = { key: string; title: string; items: PlannerItem[]; day?: string; kind?: TaskGroup["kind"] };
const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export default function TasksScreen({ folderId, tagId, title }: { folderId?: string; tagId?: string; title?: string }) {
  const t = useT();
  const { state, today, store } = usePlannerUi();
  const [layout, setLayout] = useState<Layout>(() => read("daybar-tasks-layout", ["list", "board", "table"], "list"));
  const [groupBy, setGroupBy] = useState<GroupBy>(() => read("daybar-tasks-group", ["when", "priority", "folder", "tag", "none"], "when"));
  const [sortBy, setSortBy] = useState<SortBy>(() => read("daybar-tasks-sort", ["default", "priority", "title", "created"], "default"));
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<number | null>(null);
  const [folder, setFolder] = useState<string | null>(folderId ?? null);
  const [tag, setTag] = useState<string | null>(tagId ?? null);
  const [showDone, setShowDone] = useState(true);
  const groups = useMemo<Group[]>(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const items = state.items.filter(
      (i) =>
        i.kind === "task" &&
        !i.parentId &&
        !i.deletedAt &&
        (showDone || !i.doneAt) &&
        (priority === null || i.priority === priority) &&
        (folder === null || (folder === "none" ? !i.folderId : i.folderId === folder)) &&
        (tag === null || i.tags.includes(tag)) &&
        (!q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)),
    );
    const sort = (list: PlannerItem[]) =>
      sortBy === "default"
        ? list
        : [...list].sort((a, b) =>
            sortBy === "priority" ? b.priority - a.priority || (taskDay(a) || "~").localeCompare(taskDay(b) || "~") : sortBy === "title" ? a.title.localeCompare(b.title) : b.createdAt - a.createdAt,
          );
    const doneSince = addDays(today, -30);
    if (groupBy === "when")
      return taskGroups(items, today, { doneSince }).map((g) => ({
        key: g.key,
        kind: g.kind,
        day: g.kind === "day" ? g.start! : undefined,
        items: sort(g.items),
        title:
          g.kind === "inbox"
            ? t("Eingang", "Inbox")
            : g.kind === "overdue"
              ? t("Überfällig", "Overdue")
              : g.kind === "day"
                ? dayLabel(g.start!, today, t)
                : g.kind === "week"
                  ? weekLabel(g.start!, today, t, state.settings.weekStart)
                  : g.kind === "month"
                    ? monthLabel(g.start!, today, t)
                    : g.kind === "waiting"
                      ? t("Wartet", "Waiting")
                      : g.kind === "someday"
                        ? t("Irgendwann · ohne Datum", "Someday · no date")
                        : t("Erledigt (30 Tage)", "Done (30 days)"),
      }));
    const open = items.filter((i) => !i.doneAt && (!i.doneDay || i.doneDay >= doneSince));
    const by = (key: (i: PlannerItem) => string[], name: (k: string) => string, order: string[]) => {
      const map = new Map<string, PlannerItem[]>();
      for (const i of open) for (const k of key(i)) map.set(k, [...(map.get(k) || []), i]);
      return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, list]) => ({ key: k, title: name(k), items: sort(list) }));
    };
    if (groupBy === "priority") return by((i) => [String(i.priority)], (k) => priorityName(Number(k), t), ["3", "2", "1", "0"]);
    if (groupBy === "folder")
      return by((i) => [i.folderId || "none"], (k) => (k === "none" ? t("Kein Ordner", "No folder") : state.folders.find((f) => f.id === k)?.name || "…"), [...state.folders.map((f) => f.id), "none"]);
    if (groupBy === "tag")
      return by((i) => (i.tags.length ? i.tags : ["none"]), (k) => (k === "none" ? t("Ohne Tag", "No tag") : `#${state.tags.find((x) => x.id === k)?.name || "…"}`), [...state.tags.map((x) => x.id), "none"]);
    return [{ key: "all", title: t("Alle offenen Aufgaben", "All open tasks"), items: sort(open) }];
  }, [state, today, query, priority, folder, tag, showDone, groupBy, sortBy, t]);
  if (!state) return <PlannerStatus />;
  const pickLayout = (v: Layout) => [setLayout(v), keep("daybar-tasks-layout", v)];
  const pickGroup = (v: GroupBy) => [setGroupBy(v), keep("daybar-tasks-group", v)];
  const pickSort = (v: SortBy) => [setSortBy(v), keep("daybar-tasks-sort", v)];
  const dropOnGroup = (e: React.DragEvent, group: Group) => {
    const item = state.items.find((i) => i.id === e.dataTransfer.getData(DRAG_TYPE));
    if (!item) return;
    e.preventDefault();
    if (group.day) void store.update(item.id, movedToDay(item, group.day));
    else if (group.kind === "inbox") void store.update(item.id, { day: null, time: null, period: null, folderId: null, waitingUntil: null });
    else if (group.kind === "someday") void store.update(item.id, { period: "someday", day: null, time: null, waitingUntil: null });
    else if (group.kind === "done" && !item.doneAt) void store.setDone(item.id, true);
  };
  const pills = [
    query && { label: `“${query}”`, clear: () => setQuery("") },
    priority !== null && { label: priorityName(priority, t), clear: () => setPriority(null) },
    folder !== null && !folderId && { label: folder === "none" ? t("Kein Ordner", "No folder") : state.folders.find((f) => f.id === folder)?.name || "…", clear: () => setFolder(null) },
    tag !== null && !tagId && { label: `#${state.tags.find((x) => x.id === tag)?.name || "…"}`, clear: () => setTag(null) },
    !showDone && { label: t("Ohne erledigte", "Without done"), clear: () => setShowDone(true) },
  ].filter((p): p is { label: string; clear: () => void } => !!p);
  const total = groups.reduce((n, g) => n + g.items.filter((i) => !i.doneAt).length, 0);
  return (
    <div className={`db-screen db-tasks is-${layout}`}>
      <header className="db-screen-head">
        <h1>
          {title || t("Aufgaben", "Tasks")} <span className="db-count">{total}</span>
        </h1>
        <div className="db-segmented" role="radiogroup" aria-label={t("Darstellung", "Layout")}>
          {(
            [
              ["list", List, t("Liste", "List")],
              ["board", Kanban, t("Board", "Board")],
              ["table", Table, t("Tabelle", "Table")],
            ] as const
          ).map(([v, Icon, label]) => (
            <button key={v} type="button" role="radio" aria-checked={layout === v} onClick={() => pickLayout(v)}>
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </header>
      <div className="db-toolbar">
        <input type="search" className="db-input db-search" placeholder={t("Filtern …", "Filter…")} aria-label={t("Aufgaben filtern", "Filter tasks")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label={t("Gruppieren nach", "Group by")} value={groupBy} onChange={(e) => pickGroup(e.target.value as GroupBy)}>
          <option value="when">{t("Gruppe: Wann", "Group: When")}</option>
          <option value="priority">{t("Gruppe: Priorität", "Group: Priority")}</option>
          <option value="folder">{t("Gruppe: Ordner", "Group: Folder")}</option>
          <option value="tag">{t("Gruppe: Tag", "Group: Tag")}</option>
          <option value="none">{t("Keine Gruppen", "No groups")}</option>
        </Select>
        <Select aria-label={t("Sortieren nach", "Sort by")} value={sortBy} onChange={(e) => pickSort(e.target.value as SortBy)}>
          <option value="default">{t("Sortierung: Zeit", "Sort: Time")}</option>
          <option value="priority">{t("Sortierung: Priorität", "Sort: Priority")}</option>
          <option value="title">{t("Sortierung: Titel", "Sort: Title")}</option>
          <option value="created">{t("Sortierung: Neueste", "Sort: Newest")}</option>
        </Select>
        <Select aria-label={t("Priorität", "Priority")} value={priority === null ? "" : String(priority)} onChange={(e) => setPriority(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">{t("Jede Priorität", "Any priority")}</option>
          {[3, 2, 1, 0].map((p) => (
            <option key={p} value={p}>
              {priorityName(p, t)}
            </option>
          ))}
        </Select>
        {!folderId && (
          <Select aria-label={t("Ordner", "Folder")} value={folder ?? ""} onChange={(e) => setFolder(e.target.value || null)}>
            <option value="">{t("Jeder Ordner", "Any folder")}</option>
            <option value="none">{t("Kein Ordner", "No folder")}</option>
            {state.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        )}
        {!tagId && state.tags.length > 0 && (
          <Select aria-label={t("Tag", "Tag")} value={tag ?? ""} onChange={(e) => setTag(e.target.value || null)}>
            <option value="">{t("Jeder Tag", "Any tag")}</option>
            {state.tags.map((x) => (
              <option key={x.id} value={x.id}>
                #{x.name}
              </option>
            ))}
          </Select>
        )}
        <label className="db-toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t("Erledigte", "Done")}
        </label>
      </div>
      {pills.length > 0 && (
        <div className="db-pills" aria-label={t("Aktive Filter", "Active filters")}>
          {pills.map((p) => (
            <button key={p.label} type="button" className="db-pill" onClick={p.clear} aria-label={t(`Filter ${p.label} entfernen`, `Remove filter ${p.label}`)}>
              {p.label}
              <X size={11} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <CaptureLine defaults={{ folderId: folderId ?? null, tags: tagId ? [state.tags.find((x) => x.id === tagId)?.name || ""].filter(Boolean) : [] }} kind="task" placeholder={t("Neue Aufgabe … (mit Tag, Zeit, #tag, !, ~30m)", "New task… (with a day, time, #tag, !, ~30m)")} />
      {!groups.some((g) => g.items.length) ? (
        <Empty title={t("Keine Aufgaben.", "No tasks.")} hint={pills.length ? t("Kein Treffer für diese Filter.", "Nothing matches these filters.") : undefined} />
      ) : layout === "table" ? (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                <th scope="col" className="db-col-check">
                  <span className="sr-only">{t("Erledigt", "Done")}</span>
                </th>
                <th scope="col">{t("Titel", "Title")}</th>
                <th scope="col">{t("Wann", "When")}</th>
                <th scope="col">{t("Priorität", "Priority")}</th>
                <th scope="col">{t("Ordner", "Folder")}</th>
                <th scope="col">{t("Tags", "Tags")}</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr className="db-table-group">
                  <th colSpan={6} scope="colgroup">
                    {g.title} <span className="db-count">{g.items.length}</span>
                  </th>
                </tr>
                {g.items.map((i) => (
                  <TableRow key={i.id} item={i} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <div className={layout === "board" ? "db-board" : "db-groups"}>
          {groups.map((g) => (
            <section
              key={g.key}
              className={layout === "board" ? "db-column" : "db-group"}
              aria-label={g.title}
              onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && (g.day || g.kind === "inbox" || g.kind === "someday" || g.kind === "done") && e.preventDefault()}
              onDrop={(e) => dropOnGroup(e, g)}
            >
              <header className={layout === "board" ? "db-column-head" : "db-group-head"}>
                <strong className={g.kind === "overdue" ? "db-overdue" : undefined}>{g.title}</strong>
                <span className="db-count">{g.items.length}</span>
                {g.kind === "overdue" && g.items.length > 0 && (
                  <button type="button" className="db-link-button" onClick={() => void store.updateMany(g.items.map((i) => i.id), { day: today, period: null })}>
                    {t("Alle auf heute", "All to today")}
                  </button>
                )}
              </header>
              <div className={layout === "board" ? "db-column-body" : "db-list"}>
                {g.items.map((i) => (
                  <ItemRow key={i.id} item={i} className={layout === "board" ? "db-card-row" : ""} showDay={g.kind !== "day"} draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, i.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TableRow({ item }: { item: PlannerItem }) {
  const t = useT();
  const { state, today, store, select } = usePlannerUi();
  const folder = item.folderId ? state!.folders.find((f) => f.id === item.folderId) : null;
  const day = taskDay(item);
  return (
    <tr className={item.doneAt ? "is-done" : undefined}>
      <td className="db-col-check">
        <TaskCheck item={item} onToggle={() => void store.setDone(item.id, !item.doneAt)} size={16} />
      </td>
      <td>
        <button type="button" className="db-table-title" onClick={() => select(item.id)}>
          {item.title}
        </button>
        <ItemMeta item={{ ...item, folderId: null, tags: [], time: null }} />
      </td>
      <td className={day && day < today && !item.doneAt ? "db-overdue" : undefined}>
        {item.period === "someday"
          ? t("Irgendwann", "Someday")
          : item.period === "week" && item.day
            ? weekLabel(weekStart(item.day, state!.settings.weekStart), today, t, state!.settings.weekStart)
            : item.period === "month" && item.day
              ? monthLabel(monthStart(item.day), today, t)
              : day
                ? `${dayLabel(day, today, t)}${item.time ? ` ${timeLabel(item.time)}` : ""}`
                : "–"}
      </td>
      <td>{item.priority ? priorityName(item.priority, t) : "–"}</td>
      <td>{folder ? <span className={`db-folder opt-${folder.color}`}>{folder.name}</span> : "–"}</td>
      <td>{item.tags.map((id) => `#${state!.tags.find((x) => x.id === id)?.name || ""}`).join(" ") || "–"}</td>
    </tr>
  );
}
