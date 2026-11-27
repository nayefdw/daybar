"use client";
// The one toast of the app: confirmations, errors (with "Retry") and undo
// offers ("… gelöscht · Rückgängig"). Rendered once by the workspace shell
// (<Toaster/>); everything else calls showToast()/showUndo().
//
// - Undo offers stay about 6 s, longer while the pointer or the focus is on
//   the toast. Mod+Z (⌘Z on Apple devices, Ctrl+Z elsewhere) takes the change
//   back while the offer is visible – unless the focus is in a text field or
//   the editor, where Mod+Z keeps undoing typing.
// - Two live regions that always exist: polite for confirmations and undo,
//   assertive for errors, so screen readers announce every toast.
// - On phones the toast sits above the tab bar and the safe area
//   (app/globals.css, .toast).
// - Its look follows rareui's "Toast Feedback" (app/daybar.css, Toasts): a
//   card with continuous corners, a coloured tile whose glyph draws itself
//   after the card lands, the action as a soft pill and a close button on
//   the corner while hovered; it rises in and sinks away.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "./i18n";
import { useKeyboardHints } from "@/lib/keyboard-hints";
import { eventMatches } from "@/lib/keymap";
import { tr } from "@/lib/locale-tag";

export type ToastTone = "info" | "error" | "undo";
export type ToastInput = {
  text: string;
  detail?: string;
  tone?: ToastTone;
  // A button in the toast ("Retry", "Undo").
  action?: { label: string; run: () => void };
  // Milliseconds until it goes (paused while hovered or focused).
  duration?: number;
};
type Shown = ToastInput & { id: number; tone: ToastTone };

export const UNDO_MS = 6000;
export const UNDO_COMBO = "Mod+Z";
let current: Shown | null = null;
let serial = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(input: ToastInput) {
  current = { ...input, tone: input.tone || "info", id: ++serial };
  emit();
  return current.id;
}
export function dismissToast(id?: number) {
  if (id !== undefined && current?.id !== id) return;
  current = null;
  emit();
}
// "… gelöscht · Rückgängig": undo() takes the change back.
export function showUndo(message: string, undo: () => void | Promise<unknown>) {
  let used = false;
  return showToast({
    text: message,
    tone: "undo",
    duration: UNDO_MS,
    action: {
      label: tr("Rückgängig", "Undo"),
      run: () => {
        if (used) return;
        used = true;
        void undo();
      },
    },
  });
}
// The number of the last toast: callers that show their own confirmation
// only do so when no undo offer appeared meanwhile.
export const toastSerial = () => serial;
export const undoShownSince = (since: number) => serial > since && current?.tone === "undo";
export const currentToast = () => current;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// Typing somewhere: Mod+Z belongs to that field.
const typingIn = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function Toaster() {
  const t = useT();
  const keyHints = useKeyboardHints();
  const live = useSyncExternalStore(subscribe, currentToast, () => null);
  // The last toast stays a moment after it is dismissed, to sink away.
  const [leaving, setLeaving] = useState<Shown | null>(null);
  const last = useRef<Shown | null>(null);
  useEffect(() => {
    if (live) {
      last.current = live;
      setLeaving(null);
      return;
    }
    if (!last.current) return;
    setLeaving(last.current);
    last.current = null;
    const timer = setTimeout(() => setLeaving(null), 200);
    return () => clearTimeout(timer);
  }, [live]);
  const toast = live ?? leaving;
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  // The timer: restarts for each toast, waits while paused.
  useEffect(() => {
    if (!live || paused) return;
    const timer = setTimeout(() => dismissToast(live.id), live.duration ?? (live.tone === "error" ? 8000 : 5000));
    return () => clearTimeout(timer);
  }, [live, paused]);
  useEffect(() => setPaused(false), [live?.id]);
  // Mod+Z while an undo offer is visible.
  useEffect(() => {
    const toast = live;
    if (toast?.tone !== "undo" || !toast.action) return;
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !eventMatches(e, UNDO_COMBO, keyHints.mac)) return;
      const focus = document.activeElement;
      if (typingIn(focus) && !ref.current?.contains(focus)) return;
      e.preventDefault();
      e.stopPropagation();
      run(toast);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [live, keyHints.mac]);
  function run(shown: Shown) {
    // The focus was on the toast: it goes back to the page instead of the body.
    const hadFocus = ref.current?.contains(document.activeElement);
    dismissToast(shown.id);
    shown.action?.run();
    if (hadFocus) document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }
  const combo = keyHints.keys(UNDO_COMBO);
  const body = toast && (
    <div
      ref={ref}
      key={toast.id}
      className={`toast toast-${toast.tone}${toast.tone === "error" ? " toast-error" : ""}${toast === leaving ? " is-leaving" : ""}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      {/* A confirmation gets a green tile with a tick, an error a red one with
          a cross; an undo offer none (its button says it). */}
      {toast.tone !== "undo" && (
        <span className={`toast-tile ${toast.tone === "error" ? "is-error" : "is-success"}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            {toast.tone === "error" ? (
              <>
                <path d="M7.5 7.5l9 9" pathLength={1} />
                <path d="M16.5 7.5l-9 9" pathLength={1} />
              </>
            ) : (
              <path d="M6 12.5l4 4 8-9" pathLength={1} />
            )}
          </svg>
        </span>
      )}
      {toast.detail ? (
        <span className="toast-text">
          <strong>{toast.text}</strong>
          <span>{toast.detail}</span>
        </span>
      ) : (
        <span className="toast-message">{toast.text}</span>
      )}
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          aria-keyshortcuts={toast.tone === "undo" ? (keyHints.mac ? "Meta+Z" : "Control+Z") : undefined}
          onClick={() => run(toast)}
        >
          {toast.action.label}
          {toast.tone === "undo" && combo && (
            <kbd className="toast-kbd" aria-hidden="true">
              {combo}
            </kbd>
          )}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label={t("Meldung schließen", "Close message")}
        onClick={() => dismissToast(toast.id)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  );
  return (
    <>
      <div className="toast-live" role="status" aria-live="polite" aria-atomic="true">
        {toast && toast.tone !== "error" ? body : null}
      </div>
      <div className="toast-live" role="alert" aria-live="assertive" aria-atomic="true">
        {toast && toast.tone === "error" ? body : null}
      </div>
    </>
  );
}
