"use client";
// The planner screen of an address #plan/<view>: each loads when opened, so
// the workspace's own pages carry none of them.
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePlannerUi } from "./context";
import { PlannerStatus } from "./parts";

const loading = () => <PlannerStatus />;
const Today = dynamic(() => import("./today"), { loading });
const Upcoming = dynamic(() => import("./upcoming"), { loading });
const Calendar = dynamic(() => import("./calendar"), { loading });
const Tasks = dynamic(() => import("./tasks"), { loading });
const Habits = dynamic(() => import("./habits"), { loading });
const Sync = dynamic(() => import("./sync"), { loading });
const Notes = dynamic(() => import("./lists").then((m) => m.NotesScreen), { loading });
const Events = dynamic(() => import("./lists").then((m) => m.EventsScreen), { loading });
const Favorites = dynamic(() => import("./lists").then((m) => m.FavoritesScreen), { loading });
const FolderView = dynamic(() => import("./lists").then((m) => m.FolderScreen), { loading });
const TagView = dynamic(() => import("./lists").then((m) => m.TagScreen), { loading });
const MetaIndex = dynamic(() => import("./lists").then((m) => m.MetaIndexScreen), { loading });

export const PLANNER_VIEWS = ["today", "upcoming", "calendar", "notes", "tasks", "events", "habits", "favorites", "folders", "tags", "sync", "add"] as const;
// The view of an address fragment ("plan/folder/<id>" → "folder/<id>"); null for other places.
export function planView(fragment: string): string | null {
  if (fragment === "plan") return "today";
  if (!fragment.startsWith("plan/")) return null;
  const view = fragment.slice(5);
  if ((PLANNER_VIEWS as readonly string[]).includes(view)) return view;
  if (/^(folder|tag)\/[0-9a-f-]{36}$/.test(view)) return view;
  return null;
}

export default function PlannerScreen({ view }: { view: string }) {
  const { status, quickAdd } = usePlannerUi();
  // The installed app's shortcut "Quick add" (app/manifest.ts).
  useEffect(() => {
    if (view !== "add") return;
    quickAdd({});
    window.history.replaceState(null, "", `${location.pathname}#plan/today`);
  }, [view, quickAdd]);
  if (status !== "ready") return <PlannerStatus />;
  const [base, id] = view.split("/");
  switch (base) {
    case "upcoming":
      return <Upcoming />;
    case "calendar":
      return <Calendar />;
    case "notes":
      return <Notes />;
    case "tasks":
      return <Tasks />;
    case "events":
      return <Events />;
    case "habits":
      return <Habits />;
    case "favorites":
      return <Favorites />;
    case "folders":
      return <MetaIndex kind="folders" />;
    case "tags":
      return <MetaIndex kind="tags" />;
    case "folder":
      return <FolderView id={id} />;
    case "tag":
      return <TagView id={id} />;
    case "sync":
      return <Sync />;
    default:
      return <Today />;
  }
}
