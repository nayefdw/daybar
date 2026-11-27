"use client";
// The right-click menu of a planner item – rows, cards, calendar blocks,
// habits, favourites: complete or check off, open, move to a day, priority,
// icon, favourite, duplicate, delete. The arrow keys move through it,
// Escape, scrolling or a click elsewhere close it.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Check, CircleCheck, CircleDashed, Copy, Ellipsis, ExternalLink, Flag, Star, Trash2 } from "lucide-react";
import { suggestIcons } from "@/lib/daybar/icons";
import { useIconSet } from "./item-icon";
import { burst, recentIcons, rememberIcon } from "./icon-reactions";
import { useT } from "../i18n";
import { addDays, taskDay, weekStart, type PlannerItem } from "@/lib/daybar/model";
import { checkinsOf } from "./store";
import { usePlannerUi } from "./context";
import { priorityName } from "./parts";

export type MenuAt = { item: PlannerItem; x: number; y: number };

export default function ItemMenu({ at, onClose, onChooseIcon }: { at: MenuAt; onClose: () => void; onChooseIcon: (x: number, y: number) => void }) {
  const t = useT();
  const ui = usePlannerUi();
  const { store, today, state } = ui;
  const item = state?.items.find((i) => i.id === at.item.id) ?? at.item;
  const menu = useRef<HTMLDivElement>(null);
  const place: CSSProperties = { left: at.x, top: at.y, visibility: "hidden" };
  const close = useRef(onClose);
  close.current = onClose;

  // At the pointer, inside the window; it opens towards the room it has.
  // Placed before the first paint, then the first entry takes the focus.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8));
    const top = at.y + box.height + 8 > window.innerHeight ? Math.max(8, at.y - box.height) : at.y;
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, transformOrigin: `${at.x - left}px ${at.y - top}px`, visibility: "visible" });
    el.querySelector<HTMLElement>("[role^=menuitem]")?.focus();
  }, [at.x, at.y]);

  useEffect(() => {
    const opened = Date.now();
    const away = (e: Event) => !menu.current?.contains(e.target as Node) && close.current();
    const scrolled = () => Date.now() - opened > 300 && close.current();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", close.current);
    window.addEventListener("blur", close.current);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", close.current);
      window.removeEventListener("blur", close.current);
    };
  }, []);

  const run = (action: () => unknown) => () => {
    onClose();
    void action();
  };
  const moveKeys = (e: React.KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const all = [...(menu.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)") || [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (step ?? 0) + all.length) % all.length;
    all[next]?.focus();
  };

  const done = !!item.doneAt;
  const icons = useIconSet(true);
  const suggestions = suggestIcons(item.title, item.kind, recentIcons(), 5);
  const checkedToday = item.kind === "habit" && checkinsOf(state?.logs || [], item.id).has(today);
  const nextWeek = addDays(weekStart(today, state?.settings.weekStart ?? 1), 7);
  const day = item.kind === "task" ? taskDay(item) : item.day;
  // Moving keeps an event's length and every time of day.
  const moveTo = (target: string | "someday") => {
    if (target === "someday") return store.update(item.id, { period: "someday", day: null, time: null });
    if (item.kind === "event" && item.day) {
      const span = item.endDay ? (Date.parse(item.endDay) - Date.parse(item.day)) / 86_400_000 : 0;
      return store.update(item.id, { day: target, endDay: item.endDay ? addDays(target, span) : null });
    }
    return store.update(item.id, { day: target, period: null });
  };
  const days: [string, string | "someday"][] = [
    [t("Heute", "Today"), today],
    [t("Morgen", "Tomorrow"), addDays(today, 1)],
    [t("Nächste Woche", "Next week"), nextWeek],
    ...(item.kind === "task" ? ([[t("Irgendwann", "Someday"), "someday"]] as [string, "someday"][]) : []),
  ];

  const entry = (icon: ReactNode, label: string, action: () => unknown, extra: { danger?: boolean; hint?: string } = {}) => (
    <button type="button" role="menuitem" className={`db-menu-item${extra.danger ? " is-danger" : ""}`} onClick={run(action)} onKeyDown={moveKeys}>
      {icon}
      <span>{label}</span>
      {extra.hint && <span className="db-menu-hint">{extra.hint}</span>}
    </button>
  );

  return (
    <div ref={menu} className="db-menu" role="menu" aria-label={item.title || t("Eintrag", "Item")} style={place} onContextMenu={(e) => e.preventDefault()}>
      <div className="db-menu-title" aria-hidden>
        {item.title || "…"}
      </div>
      {item.kind === "task" &&
        entry(done ? <CircleDashed size={16} aria-hidden /> : <CircleCheck size={16} aria-hidden />, done ? t("Wieder öffnen", "Reopen") : t("Erledigt", "Complete"), () => store.setDone(item.id, !done))}
      {item.kind === "habit" &&
        entry(<Check size={16} aria-hidden />, checkedToday ? t("Heute nicht abgehakt", "Uncheck today") : t("Heute abhaken", "Check off today"), () => store.checkHabit(item.id, today, !checkedToday))}
      {item.kind === "note" && item.pageId && entry(<ExternalLink size={16} aria-hidden />, t("Notiz öffnen", "Open note"), () => ui.openPage(item.pageId!))}
      {entry(<ArrowUpRight size={16} aria-hidden />, t("Details", "Details"), () => ui.select(item.id))}

      {item.kind !== "habit" && !item.parentId && (
        <>
          <div className="db-menu-separator" role="separator" />
          <div className="db-menu-label">{item.kind === "note" ? t("An Tag heften", "Pin to day") : t("Verschieben auf", "Move to")}</div>
          <div className="db-menu-row" role="group" aria-label={item.kind === "note" ? t("An Tag heften", "Pin to day") : t("Verschieben auf", "Move to")}>
            {days.map(([label, target]) => (
              <button
                key={label}
                type="button"
                role="menuitemradio"
                aria-checked={target === "someday" ? item.period === "someday" : day === target && !item.period}
                className="db-menu-chip"
                onClick={run(() => moveTo(target))}
                onKeyDown={moveKeys}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {item.kind === "task" && (
        <>
          <div className="db-menu-label">{t("Priorität", "Priority")}</div>
          <div className="db-menu-row" role="group" aria-label={t("Priorität", "Priority")}>
            {([0, 1, 2, 3] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={item.priority === p}
                aria-label={priorityName(p, t)}
                title={priorityName(p, t)}
                className={`db-menu-chip db-menu-priority pri-${p}`}
                onClick={run(() => store.update(item.id, { priority: p }))}
                onKeyDown={moveKeys}
              >
                <Flag size={14} fill={p ? "currentColor" : "none"} aria-hidden />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="db-menu-separator" role="separator" />
      <div className="db-menu-label">{t("Symbol", "Icon")}</div>
      <div className="db-menu-row" role="group" aria-label={t("Symbol", "Icon")}>
        {suggestions.map((name) => {
          const Icon = icons?.[name];
          return (
            <button
              key={name}
              type="button"
              role="menuitemradio"
              aria-checked={item.icon === name}
              aria-label={name.replace(/-\d+$/, "").replace(/-/g, " ")}
              title={name.replace(/-\d+$/, "").replace(/-/g, " ")}
              className="db-menu-chip db-menu-icon"
              onClick={(e) => {
                rememberIcon(name);
                burst(e.currentTarget);
                onClose();
                void store.update(item.id, { icon: item.icon === name ? null : name });
              }}
              onKeyDown={moveKeys}
            >
              {Icon ? <Icon size={16} aria-hidden /> : <span className="db-icon-box" aria-hidden />}
            </button>
          );
        })}
        <button
          type="button"
          role="menuitem"
          className="db-menu-chip db-menu-icon"
          aria-label={t("Alle Symbole …", "All icons…")}
          title={t("Alle Symbole …", "All icons…")}
          onClick={() => {
            const box = menu.current?.getBoundingClientRect();
            onClose();
            onChooseIcon(box?.left ?? at.x, box?.top ?? at.y);
          }}
          onKeyDown={moveKeys}
        >
          <Ellipsis size={16} aria-hidden />
        </button>
      </div>
      {entry(<Star size={16} fill={item.favorite ? "currentColor" : "none"} aria-hidden />, item.favorite ? t("Aus Favoriten entfernen", "Remove from favourites") : t("Zu Favoriten", "Add to favourites"), () =>
        store.update(item.id, { favorite: !item.favorite }),
      )}
      {item.kind !== "note" && entry(<Copy size={16} aria-hidden />, t("Duplizieren", "Duplicate"), () => store.duplicate(item).then((copy) => copy && ui.select(copy.id)))}
      <div className="db-menu-separator" role="separator" />
      {entry(<Trash2 size={16} aria-hidden />, t("Löschen", "Delete"), () => store.remove(item.id, item.title), { danger: true })}
    </div>
  );
}
