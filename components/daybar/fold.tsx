"use client";
// Groups that fold: a group's heading shows or hides its items (Today's
// cards, the task groups, habits, events, Upcoming's days). Which groups
// are folded is remembered on this device.
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

const KEY = "daybar-folded";
const EMPTY: ReadonlySet<string> = new Set();
let folded: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  if (folded) return folded;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    folded = new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    folded = new Set();
  }
  return folded;
}
function write(next: ReadonlySet<string>) {
  folded = next;
  try {
    // The last few hundred are plenty (days fold too).
    localStorage.setItem(KEY, JSON.stringify([...next].slice(-300)));
  } catch {}
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// [folded, toggle, opened] for a group's key (no key: never folded);
// `opened` is true once the person unfolded it here, so only then the
// items slide in – not on every page load.
export function useFolded(key: string | undefined) {
  const set = useSyncExternalStore(subscribe, read, () => EMPTY);
  const [opened, setOpened] = useState(false);
  const isFolded = !!key && set.has(key);
  const toggle = () => {
    if (!key) return;
    const next = new Set(read());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpened(!next.has(key));
    write(next);
  };
  return [isFolded, toggle, opened] as const;
}

// The heading's button: a chevron that turns, the title and its count.
export function FoldButton({ folded, onToggle, controls, children, className = "" }: { folded: boolean; onToggle: () => void; controls?: string; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`db-fold ${className}`} aria-expanded={!folded} aria-controls={controls} onClick={onToggle}>
      {children}
      <ChevronRight size={14} className="db-fold-chevron" aria-hidden />
    </button>
  );
}
