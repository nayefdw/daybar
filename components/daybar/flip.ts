"use client";
// Rows glide to their new place after a task is done (after rareui's task
// list): the positions of a container's [data-item] rows are kept after
// every render; for a moment after a task was ticked, rows that moved slide
// from where they were (FLIP) instead of jumping.
import { useLayoutEffect, useRef, type RefObject } from "react";

let reorderUntil = 0;
// A task was just ticked: the next renders may move rows.
export const expectReorder = (ms = 2200) => {
  reorderUntil = Date.now() + ms;
};

export function useFlip(ref: RefObject<HTMLElement | null>) {
  const last = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-item]")];
    const now = new Map(rows.map((el) => [el.dataset.item!, el.getBoundingClientRect()] as const));
    const moving = Date.now() < reorderUntil && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (moving)
      for (const el of rows) {
        const before = last.current.get(el.dataset.item!);
        const after = now.get(el.dataset.item!);
        if (!before || !after) continue;
        const dx = before.left - after.left,
          dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    last.current = now;
  });
}
