import { useId } from "react";

// Daybar's mark: a sun rising over the bar of a day, with a shorter line
// beneath it for what the day holds, white on the ultramarine tile. Keep in
// sync with public/icon.svg and logoSvg in lib/workspace-theme.ts. A
// workspace's accent (#277) recolours the tile and the glyph through
// --logo-* (app/globals.css .brand-mark); without one the attributes below
// are what shows.
export const MARK_PATHS = {
  sun: "M10.2 14.6a5.8 5.8 0 0 1 11.6 0Z",
  bar: { x: 6.6, y: 16.6, width: 18.8, height: 3, rx: 1.5 },
  line: { x: 6.6, y: 21.2, width: 11.2, height: 2.6, rx: 1.3, opacity: 0.5 },
} as const;

export function BrandMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop className="brand-mark-from" offset="0" stopColor="#4146e6" />
          <stop className="brand-mark-to" offset="1" stopColor="#6a3fe0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <g className="brand-mark-fill" fill="#fff">
        <path d={MARK_PATHS.sun} />
        <rect {...MARK_PATHS.bar} />
        <rect {...MARK_PATHS.line} />
      </g>
    </svg>
  );
}
