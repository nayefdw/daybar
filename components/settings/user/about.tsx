"use client";
// Settings → Über Daybar: the running version, the licence (AGPL-3.0) with
// the source of what runs here, the credit to flowplan (which Daybar is a
// fork of), links to docs and bug reports, and one quiet way to support
// flowplan's development. What may be shown is
// decided on the server (lib/about.ts): FLOWPLAN_SOURCE_URL, and no sponsor
// link with FLOWPLAN_HIDE_SPONSOR or inside the mobile apps.
import { useSyncExternalStore, type ReactNode } from "react";
import { ArrowCircleUp, ArrowSquareOut, Gift, Heart } from "@phosphor-icons/react";
import { openWhatsNew } from "@/lib/update-notes-client";
import { ISSUES_URL, LICENSE_URL, SPONSOR_URL, hideSponsorInPage } from "@/lib/about";
import { BRAND_REPOSITORY, UPSTREAM_AUTHOR, UPSTREAM_REPOSITORY } from "@/lib/brand";
import { LOCALE_TAG } from "@/lib/locale-tag";
import { useLocale, useT } from "../../i18n";
import { docsLanguage } from "@/lib/i18n";
import { SettingGroup, SettingRow, StatusBadge } from "../../settings-ui";
import { useUserSettings } from "../user-context";

const noSubscribe = () => () => {};

function External({ href, children, label }: { href: string; children: ReactNode; label?: string }) {
  const t = useT();
  return (
    <a className="about-link" href={href} target="_blank" rel="noopener" aria-label={label ? `${label} (${t("öffnet in neuem Tab", "opens in a new tab")})` : undefined}>
      <span>{children}</span>
      <ArrowSquareOut size={14} aria-hidden />
    </a>
  );
}

// "https://github.com/a/b" → "github.com/a/b"
const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export default function AboutSection() {
  const t = useT();
  const locale = useLocale();
  const { boot } = useUserSettings();
  const about = boot.instance?.about;
  // The mobile apps' bridge, for an app whose user agent the server missed.
  const inApp = useSyncExternalStore(noSubscribe, () => hideSponsorInPage(), () => false);
  const docsUrl = `https://docs.flowplan.org/${docsLanguage(locale)}`;
  const sponsor = !!about?.sponsor && !inApp;
  const source = about?.sourceUrl || BRAND_REPOSITORY;
  const channel = about?.channel === "beta" ? t("Beta", "Beta") : about?.channel === "release" ? t("Release", "Release") : "";
  return (
    <>
      <SettingGroup id="version" title={t("Version", "Version")}>
        <SettingRow
          label={t("Laufende Version", "Running version")}
          description={about?.builtAt ? t(`Gebaut am ${new Date(about.builtAt).toLocaleString(LOCALE_TAG)}`, `Built on ${new Date(about.builtAt).toLocaleString(LOCALE_TAG)}`) : undefined}
        >
          <span className="about-version">
            <strong>{about?.version ? `Daybar ${about.version}` : t("Version unbekannt", "Version unknown")}</strong>
            {channel && (
              <StatusBadge tone={about?.channel === "beta" ? "warn" : "ok"} title={about?.channel === "beta" ? t("Vorabversion (Docker-Tag :beta)", "Pre-release (Docker tag :beta)") : t("Veröffentlichte Version", "Published release")}>
                {channel}
              </StatusBadge>
            )}
            {about?.commit &&
              (about.commitUrl ? (
                <a href={about.commitUrl} target="_blank" rel="noopener" title={t(`Commit ${about.commit} auf GitHub ansehen`, `View commit ${about.commit} on GitHub`)}>
                  <code>{about.commit.slice(0, 7)}</code>
                </a>
              ) : (
                <code title={t(`Commit ${about.commit}`, `Commit ${about.commit}`)}>{about.commit.slice(0, 7)}</code>
              ))}
          </span>
        </SettingRow>
        {/* "Was ist neu" (#223): the release notes bundled with this version. */}
        <SettingRow anchor="whats-new" label={t("Was ist neu", "What’s new")} description={t("Die Versionshinweise der letzten Versionen.", "The release notes of the latest versions.")}>
          <button type="button" className="button" onClick={openWhatsNew}>
            <Gift size={16} aria-hidden="true" />
            {t("Was ist neu anzeigen", "Show what’s new")}
          </button>
        </SettingRow>
        {about?.update && (
          <div className="callout about-update" role="status">
            <ArrowCircleUp size={18} aria-hidden />
            <span>{t(`flowplan ${about.update.latest} ist verfügbar.`, `flowplan ${about.update.latest} is available.`)}</span>
            <a href="#settings/instance/general">{t("Zur Instanz", "Go to the instance")}</a>
          </div>
        )}
      </SettingGroup>
      <SettingGroup id="licence" title={t("Lizenz & Quellcode", "Licence & source code")}>
        <SettingRow
          // A non-breaking hyphen: "AGPL-3.0" stays on one line on phones.
          label={t("Daybar ist freie Software unter der GNU AGPL‑3.0", "Daybar is free software under the GNU AGPL‑3.0")}
          description={t(
            "Du darfst Daybar nutzen, verändern und weitergeben. Wer eine veränderte Fassung für andere betreibt, stellt ihnen deren Quellcode bereit.",
            "You may use, change and share Daybar. Whoever runs a changed version for others offers them its source code.",
          )}
        >
          <External href={LICENSE_URL} label={t("Lizenztext", "Licence text")}>
            {t("Lizenztext", "Licence text")}
          </External>
        </SettingRow>
        <SettingRow
          anchor="source"
          label={t("Quellcode", "Source code")}
          description={about?.customSource ? t("Der Quellcode des Codes, der auf dieser Instanz läuft.", "The source of the code running on this instance.") : t("Der Quellcode von Daybar auf GitHub.", "Daybar’s source code on GitHub.")}
        >
          <External href={source} label={t("Quellcode", "Source code")}>
            <span className="about-url">{shortUrl(source)}</span>
          </External>
        </SettingRow>
        <SettingRow
          anchor="upstream"
          label={t(`Daybar ist ein Fork von flowplan von ${UPSTREAM_AUTHOR}`, `Daybar is a fork of flowplan by ${UPSTREAM_AUTHOR}`)}
          description={t("Dokumente, Datenbanken, Whiteboards und Journal kommen von flowplan; Daybar setzt den Tagesplaner darauf.", "Documents, databases, whiteboards and the journal come from flowplan; Daybar adds the day planner on top.")}
        >
          <External href={UPSTREAM_REPOSITORY} label="flowplan">
            <span className="about-url">{shortUrl(UPSTREAM_REPOSITORY)}</span>
          </External>
        </SettingRow>
        <p className="about-copyright">{t("flowplan © Yannic Schuller und Mitwirkende · Daybar © seine Mitwirkenden", "flowplan © Yannic Schuller and contributors · Daybar © its contributors")}</p>
      </SettingGroup>
      <SettingGroup id="links" title={t("Links", "Links")}>
        <SettingRow label={t("Dokumentation von flowplan", "flowplan’s documentation")} description={t("Anleitungen für Dokumente, Datenbanken, Whiteboards und alles, was Daybar von flowplan übernimmt.", "Guides for documents, databases, whiteboards and everything Daybar takes from flowplan.")}>
          <External href={docsUrl} label={t("Dokumentation", "Documentation")}>
            docs.flowplan.org
          </External>
        </SettingRow>
        <SettingRow
          anchor="bug"
          label={t("Fehler melden", "Report a bug")}
          description={t("Auf GitHub – nenn am besten die Version von oben.", "On GitHub – ideally with the version above.")}
        >
          <External href={ISSUES_URL} label={t("Fehler melden", "Report a bug")}>
            {t("GitHub Issues", "GitHub issues")}
          </External>
        </SettingRow>
      </SettingGroup>
      {sponsor && (
        <SettingGroup id="support" title={t("flowplan unterstützen ♥", "Support flowplan ♥")}>
          <SettingRow
            label={t("Daybar steht auf flowplan", "Daybar stands on flowplan")}
            description={t(
              "flowplan entsteht in freier Zeit und bleibt frei. Wenn Daybar dir hilft, freut sich seine Weiterentwicklung über einen Beitrag.",
              "flowplan is made in spare time and stays free. If Daybar helps you, a contribution keeps its development going.",
            )}
          >
            <a className="button about-sponsor" href={SPONSOR_URL} target="_blank" rel="noopener">
              <Heart size={16} weight="fill" aria-hidden />
              {t("GitHub Sponsors", "GitHub Sponsors")}
            </a>
          </SettingRow>
        </SettingGroup>
      )}
    </>
  );
}
