"use client";
// The sidebar's place marker (after rareui's Bounce sidebar): a small dot
// beside the open place – a planner view, one of flowplan's places, a page
// in the tree – that hops along a short arc to the next one. It follows the
// sidebar when groups fold or the list changes, without hopping then.
import { useEffect, useLayoutEffect, useRef } from "react";

const ACTIVE = ".selected, [aria-current='page']";
const SIZE = 6;

export function BounceDot({ watch }: { watch: string }) {
  const dot = useRef<HTMLSpanElement>(null);
  const last = useRef<number | null>(null);

  const target = () => {
    const el = dot.current;
    const box = el?.parentElement;
    if (!el || !box) return null;
    const active = [...box.querySelectorAll<HTMLElement>(ACTIVE)].find((n) => n.offsetParent !== null && n !== el);
    if (!active) return null;
    const rect = active.getBoundingClientRect(),
      outer = box.getBoundingClientRect();
    return Math.round(rect.top - outer.top + box.scrollTop + rect.height / 2 - SIZE / 2);
  };
  const place = (y: number | null) => {
    const el = dot.current;
    if (!el) return;
    el.style.opacity = y === null ? "0" : "1";
    if (y !== null) el.style.transform = `translate(0, ${y}px)`;
    last.current = y;
  };

  // A new place: hop there along an arc (to the right, into the room).
  useLayoutEffect(() => {
    const el = dot.current;
    const to = target();
    const from = last.current;
    place(to);
    if (!el || to === null || from === null || from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const distance = Math.abs(to - from);
    const bulge = Math.min(9, 4 + distance * 0.08);
    const frames = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const eased = 1 - (1 - t) ** 3;
      return { transform: `translate(${(bulge * Math.sin(Math.PI * t)).toFixed(2)}px, ${(from + (to - from) * eased).toFixed(2)}px)` };
    });
    el.animate(frames, { duration: 260, easing: "linear" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  // Folding, filtering, counts changing: follow without a hop.
  useEffect(() => {
    const box = dot.current?.parentElement;
    if (!box) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(target()));
    };
    const observer = new MutationObserver(follow);
    observer.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-current", "aria-expanded"] });
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", follow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span ref={dot} className="db-bounce-dot" aria-hidden style={{ opacity: 0 }} />;
}
