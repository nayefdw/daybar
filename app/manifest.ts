import type { MetadataRoute } from "next";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, pickLocale, translate } from "@/lib/i18n";
import { ensureCatalog } from "@/lib/i18n-catalogs-server";
import { BRAND } from "@/lib/brand";

// The web app manifest in the reader's language: name, description and the
// shortcuts of the installed app (long press on its icon).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  await ensureCatalog(locale);
  const t = translate(locale);
  const icon = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    name: BRAND,
    short_name: BRAND,
    description: t("Dein Tagesplaner für Aufgaben, Termine, Gewohnheiten und Notizen", "Your day planner for tasks, events, habits and notes"),
    start_url: "/",
    display: "standalone",
    background_color: "#fcfbf8",
    theme_color: "#3b3fd8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    id: "/",
    scope: "/",
    shortcuts: [
      { name: t("Heute", "Today"), short_name: t("Heute", "Today"), url: "/#plan/today", icons: icon },
      { name: t("Schnell hinzufügen", "Quick add"), short_name: t("Hinzufügen", "Add"), description: t("Eine Aufgabe, einen Termin, eine Notiz oder eine Gewohnheit in einem Satz", "A task, event, note or habit in one sentence"), url: "/#plan/add", icons: icon },
      { name: t("Kalender", "Calendar"), short_name: t("Kalender", "Calendar"), url: "/#plan/calendar", icons: icon },
      { name: t("Suchen", "Search"), short_name: t("Suchen", "Search"), url: "/#search", icons: icon },
    ],
    share_target: {
      action: "/share-target",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
