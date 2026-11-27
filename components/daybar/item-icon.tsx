"use client";
// The icon a person chose for an item or a folder (lib/daybar/icons.ts).
// The drawings load once, when the first one shows (icon-set.tsx), so
// neither the shell nor a screen carries them before; until then an empty
// box of the same size keeps the line from moving.
import { useEffect, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

type IconSet = Record<string, LucideIcon>;
let loaded: IconSet | null = null;
let loading: Promise<IconSet> | null = null;

export function loadIconSet() {
  loading ||= import("./icon-set")
    .then((m) => (loaded = m.ICON_SET as IconSet))
    .catch(() => {
      // Offline before the chunk was cached: try again next time.
      loading = null;
      return {} as IconSet;
    });
  return loading;
}

export function useIconSet(wanted = true) {
  const [set, setSet] = useState<IconSet | null>(loaded);
  useEffect(() => {
    if (!wanted || set) return;
    let live = true;
    void loadIconSet().then((s) => live && Object.keys(s).length > 0 && setSet(s));
    return () => {
      live = false;
    };
  }, [wanted, set]);
  return set;
}

export function ChosenIcon({ name, size = 16, className = "", style }: { name: string | null | undefined; size?: number; className?: string; style?: CSSProperties }) {
  const set = useIconSet(!!name);
  if (!name) return null;
  const Icon = set?.[name];
  if (!Icon) return <span className={`db-icon-box ${className}`} style={{ width: size, height: size, ...style }} aria-hidden />;
  return <Icon size={size} className={`db-item-icon ${className}`} style={style} aria-hidden />;
}
