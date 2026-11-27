"use client";
// Choosing the icon in front of an item or a folder (lib/daybar/icons.ts): a
// button showing the current icon, and a small panel under it with a search
// field, the icons by group and "No icon". Escape or a click elsewhere
// closes it; the arrow keys move through the icons.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { ICON_GROUPS, type IconGroupId } from "@/lib/daybar/icons";
import { useT } from "../i18n";
import { useIconSet } from "./item-icon";
import { IconReactions, rememberIcon } from "./icon-reactions";
import type { ItemKind } from "@/lib/daybar/model";

type T = (de: string, en: string) => string;
export const iconGroupName = (id: IconGroupId, t: T) =>
  ({
    basics: t("Allgemein", "General"),
    work: t("Arbeit", "Work"),
    home: t("Zuhause", "Home"),
    health: t("Gesundheit", "Health"),
    food: t("Essen und Einkauf", "Food and shopping"),
    travel: t("Unterwegs", "Travel"),
    money: t("Geld", "Money"),
    learning: t("Lernen und Hobbys", "Learning and hobbies"),
    people: t("Menschen und Tiere", "People and pets"),
    nature: t("Natur und Wetter", "Nature and weather"),
  })[id];
// "shopping-cart" → "shopping cart".
const words = (name: string) => name.replace(/-\d+$/, "").replace(/-/g, " ");
const COLUMNS = 8;

export function IconPicker({
  value,
  onChange,
  label,
  children,
  className = "",
  disabled = false,
  open: openFrom,
  onOpenChange,
  quick,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  // An item's title and kind: the button first offers the quick pill of
  // suggestions (icon-reactions.tsx), "More" opens the whole panel.
  quick?: { title: string; kind: ItemKind };
  // The button's accessible name ("Icon of “Call Anna”").
  label: string;
  // What the button shows: the icon, or a placeholder.
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  // Opened from elsewhere (the right-click menu).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [bar, setBar] = useState(false);
  const open = openFrom ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`db-icon-button ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open || bar}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (open || bar) return [setOpen(false), setBar(false)];
          if (quick) setBar(true);
          else setOpen(true);
        }}
      >
        {children}
      </button>
      {bar && quick && (
        <IconReactions
          anchor={() => trigger.current?.getBoundingClientRect() ?? null}
          title={quick.title}
          kind={quick.kind}
          value={value}
          onPick={(icon) => {
            setBar(false);
            trigger.current?.focus();
            if (icon !== value) onChange(icon);
          }}
          onMore={() => {
            setBar(false);
            setOpen(true);
          }}
          onClose={() => setBar(false)}
        />
      )}
      {open && (
        <IconPanel
          anchor={() => trigger.current?.getBoundingClientRect() ?? null}
          owner={trigger}
          value={value}
          label={label}
          onPick={(icon) => {
            setOpen(false);
            trigger.current?.focus();
            if (icon) rememberIcon(icon);
            if (icon !== value) onChange(icon);
          }}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

// The panel alone, under a place on the screen: the picker's button, or
// where a right-click menu was.
export function IconPanel({
  anchor,
  owner,
  value,
  label,
  onPick,
  onClose,
}: {
  anchor: () => DOMRect | null;
  // Clicks on it do not count as "elsewhere" (the picker's own button).
  owner?: React.RefObject<HTMLElement | null>;
  value: string | null;
  label: string;
  onPick: (icon: string | null) => void;
  onClose: (refocus: boolean) => void;
}) {
  const t = useT();
  const set = useIconSet(true);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const [query, setQuery] = useState("");
  const place: CSSProperties = { visibility: "hidden" };
  const close = useRef(onClose);
  close.current = onClose;

  const term = query.trim().toLocaleLowerCase();
  const groups = useMemo(
    () =>
      ICON_GROUPS.map((g) => ({
        id: g.id,
        name: iconGroupName(g.id, t),
        icons: (g.names as readonly string[]).filter((n) => !term || words(n).includes(term) || iconGroupName(g.id, t).toLocaleLowerCase().includes(term)),
      })).filter((g) => g.icons.length > 0),
    [term, t],
  );

  // Under the button, inside the window – placed once, where it opened,
  // before the first paint; then the search field takes the focus.
  useLayoutEffect(() => {
    const box = anchor();
    const el = panel.current;
    if (!box || !el) return;
    const width = Math.min(328, window.innerWidth - 16);
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    const below = window.innerHeight - box.bottom - 12;
    const height = Math.min(380, below >= 260 ? below : box.top - 14);
    const top = below >= 260 ? box.bottom + 6 : Math.max(8, box.top - height - 6);
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${height}px`, visibility: "visible" });
    search.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || owner?.current?.contains(target)) return;
      close.current(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current(true);
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [owner]);

  // Arrow keys within the grid of all shown icons.
  const move = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key];
    if (!step) return;
    e.preventDefault();
    const all = [...(panel.current?.querySelectorAll<HTMLButtonElement>(".db-icon-cell") || [])];
    const i = all.indexOf(e.currentTarget);
    const next = all[i + step];
    if (next) next.focus();
    else if (step < 0 && i + step < 0) search.current?.focus();
  };

  return createPortal(
    <div ref={panel} className="db-icon-panel" role="dialog" aria-labelledby={headingId} style={place} onPointerDown={(e) => e.stopPropagation()}>
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      <div className="db-icon-search">
        <Search size={15} aria-hidden />
        <input
          ref={search}
          type="search"
          value={query}
          placeholder={t("Symbol suchen", "Search icons")}
          aria-label={t("Symbol suchen", "Search icons")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              panel.current?.querySelector<HTMLButtonElement>(".db-icon-cell")?.focus();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const first = groups[0]?.icons[0];
              if (first) onPick(first);
            }
          }}
        />
        {value && (
          <button type="button" className="db-icon-clear" onClick={() => onPick(null)}>
            <X size={14} aria-hidden />
            {t("Kein Symbol", "No icon")}
          </button>
        )}
      </div>
      <div className="db-icon-groups">
        {groups.length === 0 && <p className="db-hint">{t("Kein Symbol gefunden", "No icon found")}</p>}
        {groups.map((g) => (
          <section key={g.id} className="db-icon-group" aria-label={g.name}>
            <h3>{g.name}</h3>
            <div className="db-icon-grid">
              {g.icons.map((name) => {
                const Icon = set?.[name];
                return (
                  <button
                    key={name}
                    type="button"
                    className={`db-icon-cell${name === value ? " is-on" : ""}`}
                    aria-label={words(name)}
                    aria-pressed={name === value}
                    title={words(name)}
                    onClick={() => onPick(name)}
                    onKeyDown={move}
                  >
                    {Icon ? <Icon size={18} aria-hidden /> : <span className="db-icon-box" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
