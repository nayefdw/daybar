"use client";
// Choosing an icon the quick way (after rareui's Emoji reaction): a pill of
// suggested icons springs up over the button – from the title's words, the
// person's recent picks and the kind's usual ones – with "More" for all of
// them. A pick sends a few copies of the icon floating up. The arrow keys
// move, Escape or a click elsewhere close it.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, X } from "lucide-react";
import { suggestIcons } from "@/lib/daybar/icons";
import type { ItemKind } from "@/lib/daybar/model";
import { useT } from "../i18n";
import { useIconSet } from "./item-icon";

const RECENT_KEY = "daybar-recent-icons";
export function recentIcons(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function rememberIcon(name: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...recentIcons().filter((n) => n !== name)].slice(0, 8)));
  } catch {}
}

// A few copies of the picked icon float up from where it was picked and
// fade, slightly blurred – in a layer of their own, so they outlive menus.
export function burst(from: Element) {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const svg = from.querySelector("svg");
  if (!svg) return;
  const box = from.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "db-burst";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  const flights: Promise<unknown>[] = [];
  for (let i = 0; i < 5; i++) {
    const lane = Math.random() * 2 - 1;
    const rise = 110 + Math.random() * 40,
      drift = lane * 46,
      tilt = (1 + Math.random() * 3) * (lane < 0 ? -1 : 1),
      size = 0.8 + Math.random() * 0.3,
      x = lane * 5;
    const copy = document.createElement("span");
    copy.className = "db-burst-copy";
    copy.style.left = `${box.left + box.width / 2}px`;
    copy.style.top = `${box.top + box.height / 2}px`;
    copy.appendChild(svg.cloneNode(true));
    layer.appendChild(copy);
    const at = (part: number, scale: number, turn: number) => `translate(-50%, -50%) translate(${x + drift * part}px, ${-rise * part}px) scale(${scale}) rotate(${turn}deg)`;
    flights.push(
      copy
        .animate(
          [
            { transform: at(0, 0.6, 0), opacity: 0, filter: "blur(0px)" },
            { transform: at(0.12, size * 1.15, tilt), opacity: 1, filter: "blur(0px)", offset: 0.1 },
            { transform: at(0.65, size, -tilt * 0.65), opacity: 1, filter: "blur(0px)", offset: 0.7 },
            { transform: at(1, size * 0.75, tilt * 0.35), opacity: 0, filter: "blur(5px)" },
          ],
          { duration: 1100 + Math.random() * 400, delay: i * 110, easing: "cubic-bezier(0.4, 0.3, 0.5, 1)", fill: "both" },
        )
        .finished.catch(() => undefined),
    );
  }
  void Promise.all(flights).then(() => layer.remove());
}

export function IconReactions({
  anchor,
  title,
  kind,
  value,
  onPick,
  onMore,
  onClose,
}: {
  anchor: () => DOMRect | null;
  title: string;
  kind: ItemKind;
  value: string | null;
  onPick: (icon: string | null) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const set = useIconSet(true);
  const bar = useRef<HTMLDivElement>(null);
  const [names] = useState(() => suggestIcons(title, kind, recentIcons()));
  const close = useRef(onClose);
  close.current = onClose;

  // Centred over the button, under it when there is no room above.
  useLayoutEffect(() => {
    const box = anchor();
    const el = bar.current;
    if (!box || !el) return;
    const width = el.offsetWidth,
      height = el.offsetHeight;
    const left = Math.max(8, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - 8));
    const above = box.top - height - 14 >= 8;
    Object.assign(el.style, { left: `${left}px`, top: `${above ? box.top - height - 14 : box.bottom + 14}px`, visibility: "visible" });
    el.dataset.side = above ? "top" : "bottom";
    el.style.setProperty("--tail", `${box.left + box.width / 2 - left}px`);
    el.querySelector<HTMLElement>("button")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && close.current();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);

  const move = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const all = [...(bar.current?.querySelectorAll<HTMLButtonElement>("button") || [])];
    all[(all.indexOf(document.activeElement as HTMLButtonElement) + step + all.length) % all.length]?.focus();
  };
  const words = (name: string) => name.replace(/-\d+$/, "").replace(/-/g, " ");

  return createPortal(
    <div ref={bar} className="db-reactions" role="menu" aria-label={t("Symbol wählen", "Choose an icon")} aria-orientation="horizontal" style={{ visibility: "hidden" }} onKeyDown={move}>
      {names.map((name, i) => {
        const Icon = set?.[name];
        return (
          <button
            key={name}
            type="button"
            role="menuitemradio"
            aria-checked={name === value}
            aria-label={words(name)}
            title={words(name)}
            className={`db-reaction${name === value ? " is-on" : ""}`}
            style={{ animationDelay: `${40 + i * 35}ms` }}
            onClick={(e) => {
              rememberIcon(name);
              burst(e.currentTarget);
              onPick(name);
            }}
          >
            {Icon ? <Icon size={22} aria-hidden /> : <span className="db-icon-box" aria-hidden />}
          </button>
        );
      })}
      <button type="button" role="menuitem" className="db-reaction is-more" aria-label={t("Alle Symbole …", "All icons…")} title={t("Alle Symbole …", "All icons…")} style={{ animationDelay: `${40 + names.length * 35}ms` }} onClick={onMore}>
        <Ellipsis size={20} aria-hidden />
      </button>
      {value && (
        <button type="button" role="menuitem" className="db-reaction is-more" aria-label={t("Kein Symbol", "No icon")} title={t("Kein Symbol", "No icon")} style={{ animationDelay: `${75 + names.length * 35}ms` }} onClick={() => onPick(null)}>
          <X size={18} aria-hidden />
        </button>
      )}
      <span className="db-reactions-tail" aria-hidden />
      <span className="db-reactions-tail is-small" aria-hidden />
    </div>,
    document.body,
  );
}
