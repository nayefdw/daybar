"use client";
// The planner's other lists: Notes (flowplan documents, newest first),
// Events (upcoming, past or all, by day), one folder or one tag (its notes,
// events and tasks), Favorites, and "View all" of folders and tags with
// creating, renaming and deleting them.
import { useState } from "react";
import { Folder as FolderIcon, Mic, Pencil, Plus, Star, Tag as TagIcon, Trash2 } from "lucide-react";
import { attachRecording, canRecord, VoiceRecorder } from "./voice-note";
import { showToast } from "../toast";
import { useT } from "../i18n";
import { addDays, type Folder, type PlannerItem } from "@/lib/daybar/model";
import { usePlannerUi } from "./context";
import { IconPicker } from "./icon-picker";
import { DeleteButton } from "./delete-button";
import { ChosenIcon } from "./item-icon";
import { CaptureLine } from "./quick-add";
import { DayGroup, Empty, ItemRow, PlannerStatus, Section } from "./parts";
import { dayLabel, dayMonth, weekdayShort } from "./format";
import TasksScreen from "./tasks";

const COLORS = ["gray", "blue", "green", "orange", "red", "purple", "teal", "pink", "yellow"] as const;

export function NotesScreen() {
  const t = useT();
  const { state, store, today, select, quickAdd, canWritePages } = usePlannerUi();
  const [recording, setRecording] = useState(false);
  if (!state) return <PlannerStatus />;
  // A voice note: a new note for today with the recording.
  const keep = async (blob: Blob, seconds: number, peaks: number[]) => {
    setRecording(false);
    const at = new Date();
    const note = await store.create({ kind: "note", day: today, title: t(`Sprachnotiz · ${at.toLocaleTimeString("de", { hour: "2-digit", minute: "2-digit" })}`, `Voice note · ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`) });
    if (!note) return;
    try {
      await attachRecording(store, note, blob, seconds, peaks);
      select(note.id);
    } catch {
      showToast({ text: t("Die Aufnahme ließ sich nicht speichern.", "The recording could not be saved."), tone: "error" });
    }
  };
  const notes = state.items.filter((i) => i.kind === "note" && !i.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="db-screen db-notes">
      <header className="db-screen-head">
        <h1>
          {t("Notizen", "Notes")} <span className="db-count">{notes.length}</span>
        </h1>
        {canWritePages && canRecord() && (
          <button type="button" className="button" onClick={() => setRecording(true)} disabled={recording}>
            <Mic size={15} aria-hidden />
            {t("Aufnehmen", "Record")}
          </button>
        )}
        {canWritePages && (
          <button type="button" className="button primary" onClick={() => quickAdd({ kind: "note" })}>
            <Plus size={15} aria-hidden />
            {t("Neue Notiz", "New note")}
          </button>
        )}
      </header>
      {recording && <VoiceRecorder onDone={(blob, seconds, peaks) => void keep(blob, seconds, peaks)} onCancel={() => setRecording(false)} />}
      {notes.length ? (
        <div className="db-list">
          {notes.map((n) => (
            <ItemRow key={n.id} item={n} showDay />
          ))}
        </div>
      ) : (
        <Empty title={t("Noch keine Notizen.", "No notes yet.")} hint={t("Eine Notiz ist eine Seite: schreiben, formatieren, verlinken. „N: Einkaufsliste“ legt eine an.", "A note is a page: write, format, link. “N: Shopping list” creates one.")} />
      )}
    </div>
  );
}

type Show = "upcoming" | "past" | "all";
export function EventsScreen() {
  const t = useT();
  const { state, today } = usePlannerUi();
  const [show, setShow] = useState<Show>("upcoming");
  if (!state) return <PlannerStatus />;
  const events = state.items
    .filter((i) => i.kind === "event" && !i.deletedAt && i.day)
    .filter((i) => (show === "all" ? true : show === "upcoming" ? (i.endDay || i.day!) >= today : (i.endDay || i.day!) < today))
    .sort((a, b) => (show === "past" ? -1 : 1) * ((a.day || "").localeCompare(b.day || "") || (a.time || "").localeCompare(b.time || "")));
  const byDay = new Map<string, PlannerItem[]>();
  for (const e of events) byDay.set(e.day!, [...(byDay.get(e.day!) || []), e]);
  return (
    <div className="db-screen db-events">
      <header className="db-screen-head">
        <h1>{t("Termine", "Events")}</h1>
        <div className="db-segmented" role="radiogroup" aria-label={t("Anzeigen", "Show")}>
          {(["upcoming", "past", "all"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={show === v} onClick={() => setShow(v)}>
              {{ upcoming: t("Kommende", "Upcoming"), past: t("Vergangene", "Past"), all: t("Alle", "All") }[v]}
            </button>
          ))}
        </div>
      </header>
      <CaptureLine kind="event" placeholder={t("Neuer Termin … („Zahnarzt Freitag 14:00“)", "New event… (“Dentist friday 14:00”)")} />
      {byDay.size ? (
        [...byDay.entries()].map(([day, list]) => (
          <DayGroup key={day} fold={`events:${day}`} title={dayLabel(day, today, t)} detail={`${weekdayShort(day)} ${dayMonth(day)}`}>
            {list.map((e) => (
              <ItemRow key={e.id} item={e} />
            ))}
          </DayGroup>
        ))
      ) : (
        <Empty title={show === "past" ? t("Keine vergangenen Termine.", "No past events.") : t("Keine kommenden Termine.", "No upcoming events.")} />
      )}
    </div>
  );
}

// A folder's or a tag's notes and events; its tasks as on the Tasks page.
function Collection({ kind, id }: { kind: "folder" | "tag"; id: string }) {
  const t = useT();
  const { state, today } = usePlannerUi();
  if (!state) return <PlannerStatus />;
  const meta = kind === "folder" ? state.folders.find((f) => f.id === id) : state.tags.find((x) => x.id === id);
  if (!meta) return <Empty title={kind === "folder" ? t("Diesen Ordner gibt es nicht mehr.", "This folder no longer exists.") : t("Diesen Tag gibt es nicht mehr.", "This tag no longer exists.")} />;
  const inIt = (i: PlannerItem) => !i.deletedAt && !i.parentId && (kind === "folder" ? i.folderId === id : i.tags.includes(id));
  const notes = state.items.filter((i) => i.kind === "note" && inIt(i));
  const events = state.items.filter((i) => i.kind === "event" && inIt(i) && (i.endDay || i.day || "") >= addDays(today, -30));
  const habits = state.items.filter((i) => i.kind === "habit" && inIt(i));
  const title = kind === "folder" ? meta.name : `#${meta.name}`;
  return (
    <>
      <TasksScreen
        folderId={kind === "folder" ? id : undefined}
        tagId={kind === "tag" ? id : undefined}
        title={title}
        lead={kind === "folder" ? <FolderIconPicker folder={meta as Folder} size={22} /> : undefined}
      />
      <div className="db-screen db-collection-rest">
        {notes.length > 0 && (
          <Section fold="collection:notes" title={t("Notizen", "Notes")} count={notes.length}>
            <div className="db-list">
              {notes.map((n) => (
                <ItemRow key={n.id} item={n} showDay />
              ))}
            </div>
          </Section>
        )}
        {events.length > 0 && (
          <Section fold="collection:events" title={t("Termine", "Events")} count={events.length}>
            <div className="db-list">
              {events.map((e) => (
                <ItemRow key={e.id} item={e} showDay />
              ))}
            </div>
          </Section>
        )}
        {habits.length > 0 && (
          <Section fold="collection:habits" title={t("Gewohnheiten", "Habits")} count={habits.length}>
            <div className="db-list">
              {habits.map((h) => (
                <ItemRow key={h.id} item={h} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
export const FolderScreen = ({ id }: { id: string }) => <Collection kind="folder" id={id} />;
export const TagScreen = ({ id }: { id: string }) => <Collection kind="tag" id={id} />;

export function FavoritesScreen() {
  const t = useT();
  const { state } = usePlannerUi();
  if (!state) return <PlannerStatus />;
  const favorites = state.items.filter((i) => i.favorite && !i.deletedAt).sort((a, b) => (a.favoritePosition ?? 0) - (b.favoritePosition ?? 0));
  return (
    <div className="db-screen">
      <header className="db-screen-head">
        <h1>
          <Star size={20} fill="currentColor" aria-hidden /> {t("Favoriten", "Favourites")}
        </h1>
      </header>
      {favorites.length ? (
        <div className="db-list">
          {favorites.map((i) => (
            <ItemRow key={i.id} item={i} showDay />
          ))}
        </div>
      ) : (
        <Empty title={t("Noch keine Favoriten.", "No favourites yet.")} hint={t("Markiere einen Eintrag im rechten Bereich mit dem Stern.", "Mark an item with the star in the right panel.")} />
      )}
    </div>
  );
}

// A folder's icon in its colour; choosing another (or none: the folder symbol).
function FolderIconPicker({ folder, size }: { folder: Folder; size: number }) {
  const t = useT();
  const { store } = usePlannerUi();
  return (
    <IconPicker
      value={folder.icon}
      onChange={(icon) => void store.updateFolder(folder.id, { icon })}
      label={t(`Symbol von „${folder.name}“ wählen`, `Choose the icon of “${folder.name}”`)}
      className={`opt-${folder.color} db-folder-icon-button`}
    >
      {folder.icon ? <ChosenIcon name={folder.icon} size={size} className="planner-folder" /> : <FolderIcon size={size} fill="currentColor" className="planner-folder" aria-hidden />}
    </IconPicker>
  );
}

// "View all" of folders or tags: counts, colours, rename, delete, new.
export function MetaIndexScreen({ kind }: { kind: "folders" | "tags" }) {
  const t = useT();
  const { state, store, go } = usePlannerUi();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!state) return <PlannerStatus />;
  const list = kind === "folders" ? state.folders : state.tags;
  const count = (id: string) => state.items.filter((i) => !i.deletedAt && !i.parentId && (kind === "folders" ? i.folderId === id : i.tags.includes(id))).length;
  const Icon = kind === "folders" ? FolderIcon : TagIcon;
  const create = async () => {
    const value = name.trim();
    if (!value) return;
    setName("");
    if (kind === "folders") await store.createFolder(value, COLORS[(state.folders.length + 1) % COLORS.length]);
    else await store.createTag(value.replace(/^#/, ""));
  };
  const rename = (id: string) => {
    const value = draft.trim();
    setEditing(null);
    if (!value) return;
    if (kind === "folders") void store.updateFolder(id, { name: value });
    else void store.updateTag(id, { name: value.replace(/^#/, "") });
  };
  return (
    <div className="db-screen db-meta-index">
      <header className="db-screen-head">
        <h1>{kind === "folders" ? t("Ordner", "Folders") : t("Tags", "Tags")}</h1>
      </header>
      <form
        className="db-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input className="db-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "folders" ? t("Neuer Ordner", "New folder") : t("Neuer Tag", "New tag")} aria-label={kind === "folders" ? t("Neuer Ordner", "New folder") : t("Neuer Tag", "New tag")} maxLength={80} />
        <button type="submit" className="button" disabled={!name.trim()}>
          <Plus size={15} aria-hidden />
          {t("Anlegen", "Create")}
        </button>
      </form>
      {list.length ? (
        <ul className="db-meta-list">
          {list.map((m) => (
            <li key={m.id}>
              {kind === "folders" ? <FolderIconPicker folder={m as Folder} size={16} /> : <Icon size={16} aria-hidden className={`opt-${m.color} db-meta-swatch`} />}
              {editing === m.id ? (
                <input
                  className="db-input"
                  autoFocus
                  value={draft}
                  aria-label={t("Neuer Name", "New name")}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => rename(m.id)}
                  onKeyDown={(e) => (e.key === "Enter" ? rename(m.id) : e.key === "Escape" && setEditing(null))}
                />
              ) : (
                <button type="button" className="db-meta-name" onClick={() => go(`${kind === "folders" ? "folder" : "tag"}/${m.id}`)}>
                  {kind === "tags" ? `#${m.name}` : m.name}
                </button>
              )}
              <span className="db-count">{count(m.id)}</span>
              {kind === "folders" && (
                <select className="db-color" aria-label={t("Farbe", "Colour")} value={m.color} onChange={(e) => void store.updateFolder(m.id, { color: e.target.value })}>
                  {COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="icon-button" aria-label={t(`„${m.name}“ umbenennen`, `Rename “${m.name}”`)} onClick={() => [setEditing(m.id), setDraft(m.name)]}>
                <Pencil size={15} />
              </button>
              {/* The items stay, without this folder or tag. */}
              <DeleteButton
                size="sm"
                label={kind === "folders" ? t(`Ordner „${m.name}“ löschen (seine Einträge bleiben)`, `Delete the folder “${m.name}” (its items stay)`) : t(`Tag „${m.name}“ löschen (die Einträge bleiben)`, `Delete the tag “${m.name}” (the items stay)`)}
                onConfirm={() => void (kind === "folders" ? store.deleteFolder(m.id) : store.deleteTag(m.id))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={kind === "folders" ? t("Noch keine Ordner.", "No folders yet.") : t("Noch keine Tags.", "No tags yet.")} />
      )}
    </div>
  );
}
