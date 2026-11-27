"use client";
// One choice of a few (after rareui's Gooey nav): a soft bar of options in
// which the chosen one stands apart, filled. The gaps to its neighbours
// open on a damped spring while a neck of the bar's colour stretches across
// each gap and thins away, so the bar looks liquid. Radio buttons inside;
// the arrow keys move and choose.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";

// The gap a chosen option keeps from its neighbours, in px.
const SPAN = 12;
// The neck has thinned to nothing once the gap is this far open.
const NECK_BREAK = 0.22;
const NECK_H = 100;
// The duration picker's spring, damped so nothing overshoots.
const STIFFNESS = 200,
  DAMPING = 28;

// Two concave curves pinching toward the middle, drawn in the gap.
function neckPath(gap: number) {
  if (!Number.isFinite(gap) || gap <= 0) return "";
  const waist = NECK_H * (1 - gap / (SPAN * NECK_BREAK));
  if (waist <= 0) return "";
  const start = SPAN - gap,
    mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${SPAN} 0 L${SPAN} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

export type GooeyOption<V extends string> = {
  value: V;
  label: string;
  icon?: ReactNode;
  // The chosen fill (a CSS colour); the accent by default.
  color?: string;
};

export function GooeyNav<V extends string>({ options, value, onChange, label }: { options: readonly GooeyOption<V>[]; value: V; onChange: (value: V) => void; label: string }) {
  const id = useId().replace(/:/g, "");
  const active = Math.max(0, options.findIndex((o) => o.value === value));
  const segments = useRef<(HTMLSpanElement | null)[]>([]);
  const necks = useRef<(SVGPathElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Per seam (between option i-1 and i): the gap now and its speed.
  const motion = useRef<{ gap: number; speed: number }[]>([]);
  const first = useRef(true);

  // A seam is open beside the chosen option (and at both ends).
  const open = (seam: number) => seam === 0 || seam === options.length || seam - 1 === active || seam === active;
  const fill = (i: number) => (i === active ? options[i]?.color || "var(--blue)" : "var(--gooey-bar)");

  const paint = (seam: number, gap: number) => {
    const seg = segments.current[seam];
    if (seg) seg.style.marginLeft = `${gap}px`;
    necks.current[seam]?.setAttribute("d", neckPath(gap));
  };

  // The gaps follow the choice on a spring; the first paint sets them.
  useLayoutEffect(() => {
    const targets = options.map((_, i) => (i === 0 ? 0 : open(i) ? SPAN : -1));
    if (first.current || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      first.current = false;
      motion.current = targets.map((gap) => ({ gap, speed: 0 }));
      targets.forEach((gap, i) => paint(i, gap));
      return;
    }
    let frame = 0,
      last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      let moving = false;
      targets.forEach((target, i) => {
        const m = (motion.current[i] ||= { gap: target, speed: 0 });
        m.speed += (-STIFFNESS * (m.gap - target) - DAMPING * m.speed) * dt;
        m.gap += m.speed * dt;
        if (Math.abs(m.gap - target) < 0.05 && Math.abs(m.speed) < 0.05) [m.gap, m.speed] = [target, 0];
        else moving = true;
        paint(i, m.gap);
      });
      if (moving) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, options.length]);

  useEffect(() => () => void (motion.current = []), []);

  const keys = (e: React.KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const to = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : step ? (i + step + options.length) % options.length : -1;
    if (to < 0) return;
    e.preventDefault();
    buttons.current[to]?.focus();
    onChange(options[to].value);
  };

  return (
    <div className="db-gooey" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const on = i === active;
        return (
          <span
            key={o.value}
            ref={(el) => {
              segments.current[i] = el;
            }}
            className={`db-gooey-seg${on ? " is-on" : ""}${open(i) ? " is-open-left" : ""}${open(i + 1) ? " is-open-right" : ""}`}
            style={on && o.color ? { backgroundColor: o.color } : undefined}
          >
            {i > 0 && (
              <svg className="db-gooey-neck" width={SPAN} viewBox={`0 0 ${SPAN} ${NECK_H}`} preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id={`${id}-${i}`} x1="0" x2="1">
                    <stop offset="0" style={{ stopColor: fill(i - 1) }} />
                    <stop offset="1" style={{ stopColor: fill(i) }} />
                  </linearGradient>
                </defs>
                <path
                  ref={(el) => {
                    necks.current[i] = el;
                  }}
                  fill={`url(#${id}-${i})`}
                />
              </svg>
            )}
            <button
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => !on && onChange(o.value)}
              onKeyDown={(e) => keys(e, i)}
            >
              {o.icon}
              {o.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
