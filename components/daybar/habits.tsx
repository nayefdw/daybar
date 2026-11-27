"use client";
// Habits: "3 due today · 1 done today", then each habit with today's check,
// its rule, the on-time streak, the last seven days (tap a past day to log
// it afterwards) and the month's rate. Grouped by when they are due today,
// by folder or by tag. A new habit is a sentence ("Walk every day 7:00");
// its repeat editor opens in the right panel.
import { useMemo, useState } from "react";
import { Check, Flame } from "lucide-react";
import { ChosenIcon } from "./item-icon";
import { useT } from "../i18n";
import { Select } from "../select";
import { bestStreak, habitDue, habitFinished, monthRate, ruleLabel, streak, weekStrip } from "@/lib/daybar/repeat";
import type { PlannerItem } from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { CaptureLine } from "./quick-add";
import { Empty, Group, PlannerStatus } from "./parts";
import { dayLabel, timeLabel, weekdayName, weekdayNarrow } from "./format";
import { checkinsOf } from "./store";

type GroupBy = "today" | "folder" | "tag";

export default function HabitsScreen() {
  const t = useT();
  const { state, today, store, select, openMenu } = usePlannerUi();
  const [groupBy, setGroupBy] = useState<GroupBy>("today");
  const weekStartsOn = state?.settings.weekStart ?? 1;
  const rows = useMemo(() => {
    if (!state) return [];
    return state.items
      .filter((i) => i.kind === "habit" && !i.deletedAt)
      .map((habit) => {
        const checkins = checkinsOf(state.logs, habit.id);
        return { habit, checkins, due: habitDue(habit, today, checkins, weekStartsOn), done: checkins.has(today), finished: habitFinished(habit, checkins) };
      })
      .sort((a, b) => Number(b.due) - Number(a.due) || (a.habit.time || "~").localeCompare(b.habit.time || "~") || a.habit.title.localeCompare(b.habit.title));
  }, [state, today, weekStartsOn]);
  if (!state) return <PlannerStatus />;
  const dueCount = rows.filter((r) => r.due).length,
    doneCount = rows.filter((r) => r.due && r.done).length;
  const groups: { key: string; title: string; rows: typeof rows }[] =
    groupBy === "today"
      ? [
          { key: "due", title: t("Heute fällig", "Due today"), rows: rows.filter((r) => r.due && !r.finished) },
          { key: "other", title: t("Heute nicht fällig", "Not due today"), rows: rows.filter((r) => !r.due && !r.finished) },
          { key: "finished", title: t("Abgeschlossen", "Finished"), rows: rows.filter((r) => r.finished) },
        ]
      : groupBy === "folder"
        ? [...state.folders.map((f) => ({ key: f.id, title: f.name, rows: rows.filter((r) => r.habit.folderId === f.id) })), { key: "none", title: t("Kein Ordner", "No folder"), rows: rows.filter((r) => !r.habit.folderId) }]
        : [...state.tags.map((x) => ({ key: x.id, title: `#${x.name}`, rows: rows.filter((r) => r.habit.tags.includes(x.id)) })), { key: "none", title: t("Ohne Tag", "No tag"), rows: rows.filter((r) => !r.habit.tags.length) }];
  return (
    <div className="db-screen db-habits">
      <header className="db-screen-head">
        <div>
          <h1>{t("Gewohnheiten", "Habits")}</h1>
          <p className="db-subtitle">{t(`${dueCount} heute fällig · ${doneCount} heute erledigt`, `${dueCount} due today · ${doneCount} done today`)}</p>
        </div>
        <Select aria-label={t("Gruppieren nach", "Group by")} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          <option value="today">{t("Gruppe: Heute", "Group: Today")}</option>
          <option value="folder">{t("Gruppe: Ordner", "Group: Folder")}</option>
          <option value="tag">{t("Gruppe: Tag", "Group: Tag")}</option>
        </Select>
      </header>
      <CaptureLine kind="habit" placeholder={t("Neue Gewohnheit … („Lesen jeden Abend 21:00“, „Laufen Mo, Mi, Fr“)", "New habit… (“Read every day 21:00”, “Run every mon, wed and fri”)")} />
      {!rows.length ? (
        <Empty title={t("Noch keine Gewohnheiten", "No habits yet")} hint={t("Eine Gewohnheit wiederholt sich: jeden Tag, an Wochentagen, monatlich …", "A habit repeats: every day, on weekdays, monthly…")} />
      ) : (
        groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <Group key={g.key} fold={`habits:${g.key}`} label={g.title} title={g.title} count={g.rows.length}>
              <ul className="db-habit-list">
                {g.rows.map(({ habit, checkins, due, done }) => (
                  <HabitRow key={habit.id} habit={habit} checkins={checkins} due={due} done={done} onOpen={() => select(habit.id)} onMenu={(e) => openMenu(e, habit)} onToggle={(day, on) => void store.checkHabit(habit.id, day, on)} today={today} weekStartsOn={weekStartsOn} />
                ))}
              </ul>
            </Group>
          ))
      )}
    </div>
  );
}

function HabitRow({
  habit,
  checkins,
  due,
  done,
  onOpen,
  onMenu,
  onToggle,
  today,
  weekStartsOn,
}: {
  habit: PlannerItem;
  checkins: Map<string, boolean>;
  due: boolean;
  done: boolean;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onToggle: (day: string, on: boolean) => void;
  today: string;
  weekStartsOn: 0 | 1;
}) {
  const t = useT();
  const h = { day: habit.day, repeat: habit.repeat };
  const current = streak(h, checkins, today, weekStartsOn);
  const best = bestStreak(h, checkins, today, weekStartsOn);
  const rate = monthRate(h, checkins, today, weekStartsOn);
  return (
    <li className={`db-habit${done ? " is-done" : ""}${due ? "" : " is-off"}`} data-item={habit.id} onContextMenu={onMenu}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        className="db-habit-today"
        onClick={() => onToggle(today, !done)}
        aria-label={done ? t(`„${habit.title}“ heute nicht abgehakt`, `Uncheck “${habit.title}” for today`) : t(`„${habit.title}“ heute abhaken`, `Check off “${habit.title}” for today`)}
      >
        {done && <Check size={16} strokeWidth={2.75} aria-hidden />}
      </button>
      <button type="button" className="db-habit-main" onClick={onOpen}>
        <span className="db-row-title">
          {habit.icon && <ChosenIcon name={habit.icon} size={15} className="db-title-icon" />}
          {habit.title}
        </span>
        <span className="db-meta">
          <span>{habit.repeat ? ruleLabel(habit.repeat, t, weekdayName, weekStartsOn) : ""}</span>
          {habit.time && <span>{timeLabel(habit.time)}</span>}
          <span className="db-badge" title={t(`Beste Serie: ${best}`, `Best streak: ${best}`)}>
            <Flame size={12} aria-hidden />
            {current}
          </span>
          <span>{rate.rate === null ? "" : t(`${Math.round(rate.rate * 100)} % im Monat`, `${Math.round(rate.rate * 100)} % this month`)}</span>
        </span>
      </button>
      <div className="db-strip is-compact" role="group" aria-label={t("Die letzten sieben Tage", "The last seven days")}>
        {weekStrip(h, checkins, today, weekStartsOn).map((s) => (
          <button
            key={s.day}
            type="button"
            className={`db-strip-day is-${s.state}`}
            aria-pressed={s.state === "done" || s.state === "late"}
            disabled={s.state === "off"}
            title={`${dayLabel(s.day, today, t)}${s.state === "late" ? t(" · nachgetragen", " · logged afterwards") : ""}`}
            onClick={() => onToggle(s.day, !(s.state === "done" || s.state === "late"))}
          >
            <span>{weekdayNarrow(s.day)}</span>
          </button>
        ))}
      </div>
    </li>
  );
}
