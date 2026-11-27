"use client";
// An item's details in the right panel: everything about a task, event,
// habit or note, saved as it changes. Tasks: when (a day with a time, a
// week, a month, Someday), priority, in progress, waiting until (with
// follow-ups), duration, location, a reminder apart from the due day,
// subtasks, folder, tags, favourite. Events: start, end, all-day. Habits:
// the repeat rule and the record. Notes open their page.
import { useEffect, useId, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Plus, Shapes, Star, Trash2, X } from "lucide-react";
import { IconPicker } from "./icon-picker";
import { ChosenIcon } from "./item-icon";
import { useT } from "../i18n";
import { Select } from "../select";
import { addDays, monthStart, subtasksOf, weekStart, type PlannerItem } from "@/lib/daybar/model";
import { bestStreak, monthRate, streak, weekStrip } from "@/lib/daybar/repeat";
import { usePlannerUi } from "./context";
import { RepeatEditor } from "./repeat-editor";
import { TaskCheck, kindName, priorityName } from "./parts";
import { dayLabel, durationLabel, weekdayNarrow } from "./format";
import { checkinsOf, type ItemPatch } from "./store";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="db-field">
      <label className="db-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="db-field-body">{children}</div>
    </div>
  );
}

// A text that saves when it loses focus (or on Enter for one line).
function TextField({ value, onSave, multiline, placeholder, label, id }: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; label: string; id?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => draft !== value && onSave(draft);
  return multiline ? (
    <textarea id={id} className="db-input db-textarea" aria-label={label} value={draft} placeholder={placeholder} rows={4} onChange={(e) => setDraft(e.target.value)} onBlur={save} maxLength={20_000} />
  ) : (
    <input
      id={id}
      className="db-input"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      maxLength={300}
    />
  );
}

export function ItemDetails({ item, onClose }: { item: PlannerItem; onClose: () => void }) {
  const t = useT();
  const id = useId();
  const { store, state, today, openPage, select } = usePlannerUi();
  const update = (patch: ItemPatch) => void store.update(item.id, patch);
  const settings = state!.settings;
  const tags = item.tags.map((tid) => state!.tags.find((x) => x.id === tid)?.name).filter((x): x is string => !!x);
  const [tagDraft, setTagDraft] = useState("");
  const subtasks = item.kind === "task" ? subtasksOf(state!.items, item.id) : [];
  const [subDraft, setSubDraft] = useState("");
  const parent = item.parentId ? state!.items.find((i) => i.id === item.parentId) : null;
  const when = item.period ?? (item.day ? "day" : "none");
  return (
    <div className="db-details">
      {parent && (
        <button type="button" className="db-link-button" onClick={() => select(parent.id)}>
          ↑ {parent.title}
        </button>
      )}
      <div className="db-details-title">
        {item.kind === "task" && <TaskCheck item={item} onToggle={() => void store.setDone(item.id, !item.doneAt)} size={22} />}
        <IconPicker
          value={item.icon}
          onChange={(icon) => update({ icon })}
          label={item.icon ? t(`Symbol von „${item.title}“ ändern`, `Change the icon of “${item.title}”`) : t(`Symbol für „${item.title}“ wählen`, `Choose an icon for “${item.title}”`)}
          className={item.icon ? "has-icon" : "is-empty"}
        >
          {item.icon ? <ChosenIcon name={item.icon} size={20} /> : <Shapes size={17} aria-hidden />}
        </IconPicker>
        <TextField label={t("Titel", "Title")} value={item.title} onSave={(title) => title.trim() && update({ title })} />
      </div>
      <div className="db-details-kind">
        <span className={`qa-badge kind-${item.kind} is-small`}>{kindName(item.kind, t)}</span>
        {item.kind !== "note" && !item.parentId && (
          <Select aria-label={t("Umwandeln in", "Convert to")} value="" onChange={(e) => e.target.value && update({ kind: e.target.value as PlannerItem["kind"] })}>
            <option value="">{t("Umwandeln …", "Convert…")}</option>
            {(["task", "event", "habit"] as const)
              .filter((k) => k !== item.kind)
              .map((k) => (
                <option key={k} value={k}>
                  {kindName(k, t)}
                </option>
              ))}
          </Select>
        )}
        <button type="button" className={`icon-button${item.favorite ? " is-on" : ""}`} aria-pressed={item.favorite} onClick={() => update({ favorite: !item.favorite })} title={t("Favorit", "Favourite")}>
          <Star size={16} fill={item.favorite ? "currentColor" : "none"} />
        </button>
      </div>

      {item.kind === "note" && (
        <>
          {item.pageId ? (
            <button type="button" className="button primary db-open-note" onClick={() => openPage(item.pageId!)}>
              <ExternalLink size={16} aria-hidden />
              {t("Notiz öffnen", "Open note")}
            </button>
          ) : (
            <Field label={t("Text", "Text")}>
              <TextField label={t("Text", "Text")} value={item.body} multiline onSave={(body) => update({ body })} />
            </Field>
          )}
          <Field label={t("An Tag geheftet", "Pinned to day")} htmlFor={`${id}-pin`}>
            <input id={`${id}-pin`} type="date" className="db-input" value={item.day ?? ""} onChange={(e) => update({ day: e.target.value || null })} />
          </Field>
        </>
      )}

      {item.kind === "task" && (
        <>
          <Field label={t("Wann", "When")} htmlFor={`${id}-when`}>
            <Select
              id={`${id}-when`}
              value={when}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") update({ day: null, time: null, period: null });
                else if (v === "day") update({ period: null, day: item.day ?? today });
                else if (v === "someday") update({ period: "someday", day: null, time: null });
                else update({ period: v as "week" | "month", day: v === "week" ? weekStart(item.day ?? today, settings.weekStart) : monthStart(item.day ?? today), time: null });
              }}
            >
              <option value="none">{t("Ohne Datum", "No date")}</option>
              <option value="day">{t("An einem Tag", "On a day")}</option>
              <option value="week">{t("In einer Woche", "During a week")}</option>
              <option value="month">{t("In einem Monat", "During a month")}</option>
              <option value="someday">{t("Irgendwann", "Someday")}</option>
            </Select>
            {(when === "day" || when === "week" || when === "month") && (
              <input type="date" className="db-input" aria-label={t("Tag", "Day")} value={item.day ?? ""} onChange={(e) => e.target.value && update({ day: e.target.value })} />
            )}
            {when === "day" && <input type="time" className="db-input" aria-label={t("Uhrzeit", "Time")} value={item.time ?? ""} onChange={(e) => update({ time: e.target.value || null })} />}
          </Field>
          <Field label={t("Priorität", "Priority")}>
            <div className="db-segmented" role="radiogroup" aria-label={t("Priorität", "Priority")}>
              {[0, 1, 2, 3].map((p) => (
                <button key={p} type="button" role="radio" aria-checked={item.priority === p} className={`pri-${p}`} onClick={() => update({ priority: p as PlannerItem["priority"] })}>
                  {priorityName(p, t)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("Status", "Status")}>
            <label className="db-toggle">
              <input type="checkbox" checked={item.inProgress} disabled={!!item.doneAt} onChange={(e) => update({ inProgress: e.target.checked })} />
              {t("In Arbeit", "In progress")}
            </label>
          </Field>
          <Field label={t("Warten bis", "Waiting until")} htmlFor={`${id}-wait`}>
            <input id={`${id}-wait`} type="date" className="db-input" min={addDays(today, 1)} value={item.waitingUntil ?? ""} onChange={(e) => update({ waitingUntil: e.target.value || null })} />
            <div className="db-chip-row">
              {[
                [1, t("Morgen", "Tomorrow")],
                [3, t("3 Tage", "3 days")],
                [7, t("1 Woche", "1 week")],
                [14, t("2 Wochen", "2 weeks")],
              ].map(([n, label]) => (
                <button key={n} type="button" className="db-chip-button" onClick={() => update({ waitingUntil: addDays(today, n as number) })}>
                  {label}
                </button>
              ))}
              {item.waitingUntil && (
                <button type="button" className="db-chip-button" onClick={() => update({ waitingUntil: null })}>
                  {t("Nicht mehr warten", "Stop waiting")}
                </button>
              )}
            </div>
            {item.followUps > 0 && <small className="db-hint">{t(`Nachgefasst: ${item.followUps}-mal`, `Followed up ${item.followUps} times`)}</small>}
          </Field>
          <Field label={t("Dauer", "Duration")} htmlFor={`${id}-dur`}>
            <Select id={`${id}-dur`} value={String(item.duration ?? "")} onChange={(e) => update({ duration: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t("Keine", "None")}</option>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m, t)}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {item.kind === "event" && (
        <>
          <Field label={t("Ganztägig", "All day")}>
            <label className="db-toggle">
              <input type="checkbox" checked={item.allDay} onChange={(e) => update(e.target.checked ? { allDay: true, time: null, endTime: null } : { allDay: false, time: "09:00" })} />
              {t("Ganztägig", "All day")}
            </label>
          </Field>
          <Field label={t("Beginn", "Starts")}>
            <input type="date" className="db-input" aria-label={t("Starttag", "Start day")} value={item.day ?? ""} onChange={(e) => e.target.value && update({ day: e.target.value })} />
            {!item.allDay && <input type="time" className="db-input" aria-label={t("Startzeit", "Start time")} value={item.time ?? ""} onChange={(e) => e.target.value && update({ time: e.target.value })} />}
          </Field>
          <Field label={t("Ende", "Ends")}>
            <input type="date" className="db-input" aria-label={t("Endtag", "End day")} min={item.day ?? undefined} value={item.endDay ?? item.day ?? ""} onChange={(e) => update({ endDay: e.target.value || null })} />
            {!item.allDay && <input type="time" className="db-input" aria-label={t("Endzeit", "End time")} value={item.endTime ?? ""} onChange={(e) => e.target.value && update({ endTime: e.target.value })} />}
          </Field>
        </>
      )}

      {item.kind === "habit" && (
        <>
          <HabitRecord item={item} />
          <Field label={t("Wiederholung", "Repeat")}>
            <RepeatEditor rule={item.repeat} weekStartsOn={settings.weekStart} onChange={(repeat) => update({ repeat })} />
          </Field>
          <Field label={t("Ab", "Starts")} htmlFor={`${id}-start`}>
            <input id={`${id}-start`} type="date" className="db-input" value={item.day ?? ""} onChange={(e) => e.target.value && update({ day: e.target.value })} />
            <input type="time" className="db-input" aria-label={t("Bevorzugte Uhrzeit", "Preferred time")} value={item.time ?? ""} onChange={(e) => update({ time: e.target.value || null })} />
          </Field>
        </>
      )}

      {(item.kind === "task" || item.kind === "event") && (
        <>
          <Field label={t("Ort", "Location")}>
            <TextField label={t("Ort", "Location")} value={item.location} placeholder={t("Adresse oder Ort", "Address or place")} onSave={(location) => update({ location })} />
            {item.location && (
              <a className="db-link-button" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(item.location)}`} target="_blank" rel="noopener noreferrer">
                {t("Auf der Karte", "On the map")}
              </a>
            )}
          </Field>
          <Field label={t("Erinnerung", "Reminder")} htmlFor={`${id}-remind`}>
            <input id={`${id}-remind`} type="datetime-local" className="db-input" value={item.remindAt ?? ""} onChange={(e) => update({ remindAt: e.target.value ? e.target.value.slice(0, 16) : null })} />
            {item.day && (
              <div className="db-chip-row">
                {[
                  ["09:00", 0, t("Am Tag 9:00", "On the day 9:00")],
                  ["18:00", -1, t("Am Vortag 18:00", "Day before 18:00")],
                ].map(([time, shift, label]) => (
                  <button key={String(label)} type="button" className="db-chip-button" onClick={() => update({ remindAt: `${addDays(item.day!, shift as number)}T${time}` })}>
                    {label}
                  </button>
                ))}
                {item.remindAt && (
                  <button type="button" className="db-chip-button" onClick={() => update({ remindAt: null })}>
                    {t("Keine", "None")}
                  </button>
                )}
              </div>
            )}
          </Field>
          <Field label={t("Link", "Link")}>
            <TextField label={t("Link", "Link")} value={item.link ?? ""} placeholder="https://" onSave={(link) => update({ link: link.trim() || null })} />
          </Field>
        </>
      )}

      <Field label={t("Ordner", "Folder")} htmlFor={`${id}-folder`}>
        <Select id={`${id}-folder`} value={item.folderId ?? ""} onChange={(e) => update({ folderId: e.target.value || null })}>
          <option value="">{t("Kein Ordner", "No folder")}</option>
          {state!.folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("Tags", "Tags")} htmlFor={`${id}-tag`}>
        <div className="db-tags-edit">
          {tags.map((name) => (
            <span key={name} className="db-tag is-removable">
              #{name}
              <button type="button" aria-label={t(`Tag ${name} entfernen`, `Remove tag ${name}`)} onClick={() => update({ tags: tags.filter((x) => x !== name) })}>
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            id={`${id}-tag`}
            className="db-input db-input-tag"
            list={`${id}-tags`}
            value={tagDraft}
            placeholder={t("Tag hinzufügen", "Add tag")}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagDraft.trim()) {
                e.preventDefault();
                update({ tags: [...tags, tagDraft.trim().replace(/^#/, "")] });
                setTagDraft("");
              }
            }}
          />
          <datalist id={`${id}-tags`}>
            {state!.tags.filter((x) => !tags.includes(x.name)).map((x) => (
              <option key={x.id} value={x.name} />
            ))}
          </datalist>
        </div>
      </Field>

      {item.kind === "task" && !item.parentId && (
        <Field label={t("Unteraufgaben", "Subtasks")}>
          <ul className="db-subtasks">
            {subtasks.map((s) => (
              <li key={s.id} className={s.doneAt ? "is-done" : undefined}>
                <TaskCheck item={s} onToggle={() => void store.setDone(s.id, !s.doneAt)} size={16} />
                <button type="button" className="db-subtask-title" onClick={() => select(s.id)}>
                  {s.title}
                </button>
                <button type="button" className="icon-button" aria-label={t(`„${s.title}“ löschen`, `Delete “${s.title}”`)} onClick={() => void store.remove(s.id, s.title)}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="db-subtask-add">
            <Plus size={14} aria-hidden />
            <input
              className="db-input"
              value={subDraft}
              placeholder={t("Unteraufgabe hinzufügen", "Add subtask")}
              aria-label={t("Unteraufgabe hinzufügen", "Add subtask")}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subDraft.trim()) {
                  e.preventDefault();
                  void store.create({ kind: "task", title: subDraft.trim(), parentId: item.id });
                  setSubDraft("");
                }
              }}
            />
          </div>
        </Field>
      )}

      {item.kind !== "note" && (
        <Field label={t("Notizen", "Notes")}>
          <TextField label={t("Notizen", "Notes")} value={item.body} multiline placeholder={t("Details, Gedanken, Links …", "Details, thoughts, links…")} onSave={(body) => update({ body })} />
        </Field>
      )}

      <div className="db-details-actions">
        {item.kind !== "note" && (
          <button
            type="button"
            className="button"
            onClick={() => void store.duplicate(item).then((copy) => copy && select(copy.id))}
          >
            <Copy size={15} aria-hidden />
            {t("Duplizieren", "Duplicate")}
          </button>
        )}
        <button
          type="button"
          className="button db-danger"
          onClick={() => {
            onClose();
            void store.remove(item.id, item.title);
          }}
        >
          <Trash2 size={15} aria-hidden />
          {t("Löschen", "Delete")}
        </button>
      </div>
      {item.source === "thisday" && <p className="db-hint">{t("Aus ThisDay: ThisDay bleibt maßgeblich; Änderungen hier überschreibt der nächste Import.", "From ThisDay: ThisDay stays the truth; the next import overwrites changes made here.")}</p>}
    </div>
  );
}

// A habit's streak, best streak, month and last seven days, with
// check-ins for past days.
export function HabitRecord({ item }: { item: PlannerItem }) {
  const t = useT();
  const { state, today, store } = usePlannerUi();
  const weekStartsOn = state!.settings.weekStart;
  const checkins = checkinsOf(state!.logs, item.id);
  const habit = { day: item.day, repeat: item.repeat };
  const rate = monthRate(habit, checkins, today, weekStartsOn);
  const strip = weekStrip(habit, checkins, today, weekStartsOn);
  const [backlog, setBacklog] = useState(addDays(today, -1));
  return (
    <div className="db-habit-record">
      <div className="db-stats">
        <span>
          <strong>{streak(habit, checkins, today, weekStartsOn)}</strong>
          {t("Serie", "Streak")}
        </span>
        <span>
          <strong>{bestStreak(habit, checkins, today, weekStartsOn)}</strong>
          {t("Beste", "Best")}
        </span>
        <span>
          <strong>{rate.rate === null ? "–" : `${Math.round(rate.rate * 100)} %`}</strong>
          {t("Diesen Monat", "This month")}
        </span>
      </div>
      <div className="db-strip" role="group" aria-label={t("Die letzten sieben Tage", "The last seven days")}>
        {strip.map((s) => (
          <button
            key={s.day}
            type="button"
            className={`db-strip-day is-${s.state}`}
            aria-pressed={s.state === "done" || s.state === "late"}
            disabled={s.state === "off"}
            title={dayLabel(s.day, today, t)}
            onClick={() => void store.checkHabit(item.id, s.day, !(s.state === "done" || s.state === "late"))}
          >
            <span>{weekdayNarrow(s.day)}</span>
          </button>
        ))}
      </div>
      <div className="db-field-row">
        <input type="date" className="db-input" max={today} value={backlog} aria-label={t("Vergangener Tag", "Past day")} onChange={(e) => setBacklog(e.target.value)} />
        <button type="button" className="button" disabled={!backlog || backlog > today} onClick={() => void store.checkHabit(item.id, backlog, true)}>
          {t("Nachtragen", "Log afterwards")}
        </button>
      </div>
    </div>
  );
}
