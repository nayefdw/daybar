"use client";
// ThisDay sync and moving from the old Daybar page (lib/daybar/thisday.ts,
// lib/daybar/legacy.ts): upload a ThisDay export to import it – an older
// one is refused, one that would remove many items waits for "Import
// anyway" – and see what waits in the outbox the iPhone Shortcut fetches
// (to-thisday.json, with a personal API token). The old page's own JSON
// backup moves its items over.
import { useEffect, useRef, useState } from "react";
import { Copy, Download, RefreshCw, Upload } from "lucide-react";
import { useT } from "../i18n";
import { api } from "../ui";
import { showToast } from "../toast";
import { usePlannerUi } from "./context";
import { PlannerStatus, Section } from "./parts";

type Status = { pending: number; sent: number; lastExport: string | null; lastImport: number | null; changes: { key: string; action: string; title: string; when: string; sent: boolean }[] };
const MAX_FILE = 25 * 1024 * 1024;

async function readJson(file: File) {
  if (file.size > MAX_FILE) throw new Error("too large");
  return JSON.parse((await file.text()).replace(/^﻿/, ""));
}

export default function SyncScreen() {
  const t = useT();
  const { state, store, workspaceId } = usePlannerUi();
  const [status, setStatus] = useState<Status | null>(null);
  const [held, setHeld] = useState<{ data: unknown; removed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const thisdayInput = useRef<HTMLInputElement>(null);
  const legacyInput = useRef<HTMLInputElement>(null);
  const refresh = () =>
    api<Status>(`/api/planner/thisday/status?workspace=${workspaceId}`)
      .then(setStatus)
      .catch(() => {});
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  if (!state) return <PlannerStatus />;
  const outboxUrl = `${location.origin}/api/planner/thisday/to-thisday.json?workspace=${workspaceId}`;
  const importThisDay = async (data: unknown, force = false) => {
    setBusy(true);
    try {
      const r = await store.importThisDay(data, force);
      if (r.status === "old") showToast({ text: t("Dieser ThisDay-Export ist älter als der zuletzt importierte – nichts geändert.", "That ThisDay export is older than the one Daybar already has, so nothing changed."), tone: "error" });
      else if (r.status === "held") setHeld({ data, removed: r.removed ?? 0 });
      else {
        setHeld(null);
        showToast({ text: t(`Mit ThisDay abgeglichen: ${r.added} neu, ${r.updated} geändert, ${r.removed} entfernt.`, `Synced with ThisDay: ${r.added} new, ${r.updated} updated, ${r.removed} removed.`) });
      }
      await refresh();
    } catch (e) {
      showToast({ text: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const pickThisDay = async (file: File | undefined) => {
    if (!file) return;
    let data: unknown;
    try {
      data = await readJson(file);
    } catch {
      return showToast({ text: t("Diese Datei ist kein lesbarer ThisDay-Export.", "This file is not a ThisDay export Daybar can read."), tone: "error" });
    }
    await importThisDay(data);
  };
  const pickLegacy = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await store.importLegacy(await readJson(file));
      showToast({ text: t(`Aus dem alten Daybar übernommen: ${r.added} neu, ${r.updated} aktualisiert.`, `Moved over from the old Daybar: ${r.added} new, ${r.updated} updated.`) });
      await refresh();
    } catch (e) {
      showToast({ text: e instanceof SyntaxError ? t("Diese Datei ist keine Daybar-Sicherung.", "This file is not a Daybar backup.") : (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="db-screen db-sync">
      <header className="db-screen-head">
        <h1>{t("ThisDay und Umzug", "ThisDay and moving over")}</h1>
      </header>
      <Section className="db-card" title={t("ThisDay-Export importieren", "Import a ThisDay export")}>
        <p className="db-hint">
          {t(
            "ThisDay bleibt maßgeblich für seine eigenen Einträge: Ein Import fügt neue hinzu, übernimmt Änderungen und entfernt, was ThisDay gelöscht hat. Was du hier abhakst, bleibt, bis ThisDay es auch zeigt.",
            "ThisDay stays the truth for its own items: an import adds new ones, takes over changes and removes what ThisDay deleted. What you tick off here stays until ThisDay shows it too.",
          )}
        </p>
        <div className="db-actions">
          <input ref={thisdayInput} type="file" accept="application/json,.json" hidden onChange={(e) => void pickThisDay(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          <button type="button" className="button primary" disabled={busy} onClick={() => thisdayInput.current?.click()}>
            <Upload size={16} aria-hidden />
            {t("Export hochladen …", "Upload export…")}
          </button>
          {state.settings.thisday.lastExport && <span className="db-hint">{t(`Zuletzt importiert: Export vom ${new Date(state.settings.thisday.lastExport).toLocaleString()}`, `Last imported: export of ${new Date(state.settings.thisday.lastExport).toLocaleString()}`)}</span>}
        </div>
        {held && (
          <div className="callout db-held" role="alert">
            <span>{t(`Dieser Export würde ${held.removed} Einträge entfernen. Stammt er von einem Gerät, das noch nicht auf dem neuesten Stand ist?`, `This export would remove ${held.removed} items. Is it from a device that hasn't caught up?`)}</span>
            <button type="button" className="button" disabled={busy} onClick={() => void importThisDay(held.data, true)}>
              {t("Trotzdem importieren", "Import anyway")}
            </button>
            <button type="button" className="button" onClick={() => setHeld(null)}>
              {t("Abbrechen", "Cancel")}
            </button>
          </div>
        )}
      </Section>
      <Section
        className="db-card"
        title={t("An ThisDay senden", "Send to ThisDay")}
        count={status?.pending}
        actions={
          <button type="button" className="icon-button" aria-label={t("Aktualisieren", "Refresh")} onClick={() => void refresh()}>
            <RefreshCw size={16} />
          </button>
        }
      >
        <p className="db-hint">
          {t(
            "Deine eigenen offenen Aufgaben, Notizen und Termine und die hier abgehakten ThisDay-Einträge warten im Postausgang. Der iPhone-Kurzbefehl holt sie mit „Inhalte von URL abrufen“ ab – mit dem Header „Authorization: Bearer <API-Token>“ (Einstellungen → API-Token, mit Schreibrecht). Was er abholt, gilt als gesendet.",
            "Your own open tasks, notes and events and the ThisDay items ticked off here wait in the outbox. The iPhone Shortcut fetches them with “Get Contents of URL” – with the header “Authorization: Bearer <API token>” (Settings → API tokens, with write access). What it fetches counts as sent.",
          )}
        </p>
        <div className="db-copy-field">
          <code>{outboxUrl}</code>
          <button
            type="button"
            className="icon-button"
            aria-label={t("Adresse kopieren", "Copy address")}
            onClick={() => void navigator.clipboard?.writeText(outboxUrl).then(() => showToast({ text: t("Adresse kopiert.", "Address copied.") }))}
          >
            <Copy size={15} />
          </button>
        </div>
        <div className="db-actions">
          <a className="button" href={`${outboxUrl}&peek=1`} target="_blank" rel="noopener">
            <Download size={16} aria-hidden />
            {t("Ansehen, ohne zu senden", "View without sending")}
          </a>
          <button
            type="button"
            className="button"
            disabled={!status?.sent}
            onClick={() => void store.resendThisDay().then(refresh)}
            title={t("Falls der Kurzbefehl etwas verloren hat: alles noch einmal anbieten.", "If the Shortcut lost something: offer everything again.")}
          >
            {t("Erneut senden", "Send again")}
          </button>
          {status && <span className="db-hint">{t(`${status.pending} wartend · ${status.sent} gesendet, noch nicht in ThisDay`, `${status.pending} waiting · ${status.sent} sent, not yet in ThisDay`)}</span>}
        </div>
        {status && status.changes.length > 0 && (
          <ul className="db-outbox">
            {status.changes.slice(0, 50).map((c) => (
              <li key={c.key} className={c.sent ? "is-sent" : undefined}>
                <span className="db-badge">{c.action === "add" ? t("Neu", "Add") : t("Abhaken", "Tick")}</span>
                <span>{c.title}</span>
                {c.when && <span className="db-outbox-when">{c.when}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section className="db-card" title={t("Aus dem alten Daybar übernehmen", "Move over from the old Daybar")}>
        <p className="db-hint">
          {t(
            "Die JSON-Sicherung der alten Daybar-Seite („daybar-backup-….json“): Kategorien werden Ordner, ThisDay-Einträge bleiben mit ThisDay verbunden. Ein zweiter Import aktualisiert, statt zu verdoppeln.",
            "The old Daybar page's JSON backup (“daybar-backup-….json”): categories become folders, ThisDay's items stay linked to ThisDay. Importing it again updates instead of doubling.",
          )}
        </p>
        <input ref={legacyInput} type="file" accept="application/json,.json" hidden onChange={(e) => void pickLegacy(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        <button type="button" className="button" disabled={busy} onClick={() => legacyInput.current?.click()}>
          <Upload size={16} aria-hidden />
          {t("Sicherung hochladen …", "Upload backup…")}
        </button>
      </Section>
    </div>
  );
}
