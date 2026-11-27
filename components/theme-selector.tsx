"use client";
// Choosing light, dark or automatic (after rareui's Theme selector): a card
// per choice with a small picture of Daybar in its colours – the sidebar,
// a page with tiles – and the choice's icon and name under it. Automatic
// shows light and dark side by side. Arrow keys move and choose.
import { useRef, type CSSProperties } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import type { ThemeChoice } from "@/lib/theme";
import { useT } from "./i18n";

type Palette = { sidebar: string; panel: string; border: string; strong: string; muted: string; tile: string; accent: string };
// Daybar's own surfaces (DESIGN.md: warm paper, ultramarine).
const LIGHT: Palette = { sidebar: "#f3f1eb", panel: "#fcfbf8", border: "rgba(29, 28, 34, 0.08)", strong: "#d6d2c8", muted: "#e6e2d9", tile: "#efece5", accent: "#3b3fd8" };
const DARK: Palette = { sidebar: "#121117", panel: "#16151b", border: "rgba(255, 255, 255, 0.04)", strong: "#45424f", muted: "#272530", tile: "#1f1e26", accent: "#959bff" };

function Preview({ colors, className = "" }: { colors: Palette; className?: string }) {
  const vars = {
    "--ts-sidebar": colors.sidebar,
    "--ts-panel": colors.panel,
    "--ts-border": colors.border,
    "--ts-strong": colors.strong,
    "--ts-muted": colors.muted,
    "--ts-tile": colors.tile,
    "--ts-accent": colors.accent,
  } as CSSProperties;
  return (
    <span className={`ts-preview ${className}`} style={vars} aria-hidden>
      <span className="ts-side">
        <span className="ts-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="ts-nav">
          <span className="is-on">
            <i />
          </span>
          <span>
            <i />
          </span>
          <span>
            <i />
          </span>
        </span>
        <span className="ts-me">
          <span />
          <i />
        </span>
      </span>
      <span className="ts-main">
        <span className="ts-lines">
          <i />
          <i />
        </span>
        <span className="ts-tiles">
          <span />
          <span />
          <span />
        </span>
        <span className="ts-wide" />
      </span>
    </span>
  );
}

export function ThemeSelector({ value, onChange }: { value: ThemeChoice; onChange: (choice: ThemeChoice) => void }) {
  const t = useT();
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const choices: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    { value: "system", label: t("Automatisch", "Automatic"), icon: <SunMoon size={14} aria-hidden /> },
    { value: "light", label: t("Hell", "Light"), icon: <Sun size={14} aria-hidden /> },
    { value: "dark", label: t("Dunkel", "Dark"), icon: <Moon size={14} aria-hidden /> },
  ];
  const keys = (e: React.KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const target = e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1 : step ? (index + step + choices.length) % choices.length : -1;
    if (target < 0) return;
    e.preventDefault();
    items.current[target]?.focus();
    onChange(choices[target].value);
  };
  return (
    <div className="theme-selector" role="radiogroup" aria-label={t("Erscheinungsbild", "Appearance")}>
      {choices.map((choice, index) => {
        const active = choice.value === value;
        return (
          <div key={choice.value} className="ts-option">
            <button
              ref={(el) => {
                items.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={choice.label}
              tabIndex={active ? 0 : -1}
              className="ts-card"
              onClick={() => !active && onChange(choice.value)}
              onKeyDown={(e) => keys(e, index)}
            >
              <span className="ts-frame">
                {choice.value === "dark" ? (
                  <Preview colors={DARK} />
                ) : (
                  <>
                    <Preview colors={LIGHT} />
                    {choice.value === "system" && <Preview colors={DARK} className="is-half" />}
                  </>
                )}
              </span>
              <span className="ts-ring" />
            </button>
            <span className={`ts-label${active ? " is-on" : ""}`} aria-hidden>
              {choice.icon}
              {choice.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
