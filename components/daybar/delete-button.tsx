"use client";
// Deleting with a second thought (after rareui's Delete button): the bin
// tile widens, its lid swings open and two round buttons slide in – a tick
// to delete, a cross to keep. Deleting shows a drawn tick before it is done;
// keeping lets the bin settle. Escape or a click elsewhere keeps.
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";

type Status = "idle" | "deleted" | "kept";
// How long the tick shows before the item goes (the panel closes with it).
const CONFIRM_MS = 520;

export function DeleteButton({ label, onConfirm, size = "md", className = "" }: { label: string; onConfirm: () => void; size?: "sm" | "md"; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const resolve = (next: Exclude<Status, "idle">) => {
    setOpen(false);
    setStatus(next);
    trigger.current?.focus();
    if (next === "deleted") setTimeout(onConfirm, CONFIRM_MS);
  };

  // Back to rest after the tick or the settle.
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), status === "deleted" ? 1400 : 600);
    return () => clearTimeout(timer);
  }, [status]);

  // A click elsewhere keeps the item.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && resolve("kept");
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      ref={root}
      className={`db-delete is-${size} ${className}`}
      data-open={open || undefined}
      data-status={status}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          resolve("kept");
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="db-delete-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => {
          if (open) return resolve("kept");
          setStatus("idle");
          setOpen(true);
        }}
      >
        {status === "deleted" ? (
          <svg className="db-delete-done" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12.5 9.5 18 20 7" pathLength={1} />
          </svg>
        ) : (
          <svg className="db-delete-bin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="db-bin-body" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <g className="db-bin-lid">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </g>
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "deleted" ? t("Gelöscht", "Deleted") : status === "kept" ? t("Behalten", "Kept") : ""}
      </span>
      {open && (
        <div className="db-delete-panel">
          <span className="db-delete-tail" aria-hidden />
          <button type="button" className="db-delete-circle is-confirm" aria-label={t("Löschen bestätigen", "Confirm delete")} onClick={() => resolve("deleted")} autoFocus>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12.5 9.5 18 20 7" />
            </svg>
          </button>
          <button type="button" className="db-delete-circle" aria-label={t("Abbrechen", "Cancel")} onClick={() => resolve("kept")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" aria-hidden>
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
