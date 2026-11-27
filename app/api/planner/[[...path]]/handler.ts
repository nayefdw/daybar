// Daybar's planner (lib/daybar/store.ts, docs/daybar/architecture.md):
//
//   GET  /api/planner/state?workspace=&today=      the person's planner: items,
//        habit check-ins, folders, tags and settings
//   GET  /api/planner/day-notes?workspace=&from=&to=   the text of the day
//        notes (the journal's days) in a range, for the Today page
//   POST /api/planner                              { action, workspaceId, today, … }
//        every change (lib/daybar/store.ts plannerCommand)
//   GET  /api/planner/thisday/status?workspace=    the ThisDay sync: what
//        waits in the outbox, the last export imported
//   GET  /api/planner/thisday/to-thisday.json[?workspace=][&peek=1]
//        the outbox for the iPhone Shortcut: the adds and ticks ThisDay has
//        not seen, remembered as sent once fetched (not with peek=1, nor
//        with a read-only API token)
//
// Browser sessions and personal API tokens (Authorization: Bearer …);
// everything is the signed-in person's own planner in a workspace they
// belong to.
import { serverError } from "@/lib/request-context";
import { z } from "zod";
import { checkOrigin, HttpError, refuseReadToken, requireUser } from "@/lib/auth";
import { withRequestLocale } from "@/lib/content-locale";
import { readJsonLimited } from "@/lib/request-body";
import { all } from "@/lib/db";
import { requireMember } from "@/lib/permissions";
import { isDay } from "@/lib/daybar/model";
import type { Identity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An export of ThisDay or the old Daybar page with thousands of items.
const BODY_LIMIT = 25 * 1024 * 1024;
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Ungültige ID.");
const NO_STORE = { "Cache-Control": "no-store" };

function failure(e: unknown) {
  if (e instanceof z.ZodError) return Response.json({ error: "Ungültige Eingabe.", details: e.issues.map((i) => i.message) }, { status: 400, headers: NO_STORE });
  if (!(e instanceof HttpError)) console.error(e);
  return Response.json(
    { error: e instanceof HttpError ? e.message : "Die Anfrage konnte nicht verarbeitet werden." },
    { status: e instanceof HttpError ? e.status : serverError(e), headers: NO_STORE },
  );
}
// The person's local day: the browser sends it; the server's otherwise.
const todayOf = (value: string | null) => (value && isDay(value) ? value : new Date().toISOString().slice(0, 10));
// The workspace named, or – for the Shortcut – the person's only one.
async function workspaceOf(user: Identity, value: string | null) {
  if (value) {
    const workspaceId = uuid.parse(value).toLowerCase();
    await requireMember(user, workspaceId);
    return workspaceId;
  }
  const own = await all<{ workspace_id: string }>("SELECT workspace_id FROM members WHERE user_id=? ORDER BY workspace_id LIMIT 2", user.id);
  if (own.length !== 1) throw new HttpError(400, "Bitte den Arbeitsbereich angeben (workspace=…).");
  return own[0].workspace_id;
}

type Context = { params: Promise<{ path?: string[] }> };

export const GET = withRequestLocale(async (req: Request, { params }: Context) => {
  try {
    const user = await requireUser();
    const path = ((await params).path || []).join("/");
    const url = new URL(req.url);
    const workspace = url.searchParams.get("workspace");
    const today = todayOf(url.searchParams.get("today"));
    if (path === "state") {
      const { plannerState } = await import("@/lib/daybar/store");
      return Response.json(await plannerState(user, await workspaceOf(user, workspace), today), { headers: NO_STORE });
    }
    if (path === "day-notes") {
      const from = todayOf(url.searchParams.get("from")),
        to = todayOf(url.searchParams.get("to"));
      if (to < from || to > `${Number(from.slice(0, 4)) + 1}${from.slice(4)}`) throw new HttpError(400, "Ungültiger Zeitraum.");
      const { dayNoteTexts } = await import("@/lib/daybar/store");
      return Response.json(await dayNoteTexts(user, await workspaceOf(user, workspace), from, to), { headers: NO_STORE });
    }
    if (path === "thisday/status" || path === "thisday/to-thisday.json") {
      const workspaceId = await workspaceOf(user, workspace);
      const { plannerSettings } = await import("@/lib/daybar/store");
      const { outboxChanges, serveOutbox } = await import("@/lib/daybar/thisday-server");
      const { transaction } = await import("@/lib/db");
      const ctx = { user, workspaceId, today, settings: await plannerSettings(user.id, workspaceId) };
      if (path === "thisday/status") {
        const changes = await outboxChanges(ctx);
        return Response.json(
          {
            pending: changes.filter((c) => !c.sent).length,
            sent: changes.filter((c) => c.sent).length,
            lastExport: ctx.settings.thisday.lastExport,
            lastImport: ctx.settings.thisday.lastImport,
            changes: changes.slice(0, 200),
          },
          { headers: NO_STORE },
        );
      }
      // Marked as sent unless only peeking; a read-only token only reads.
      const mark = url.searchParams.get("peek") !== "1" && user.apiScope !== "read";
      const doc = mark ? await transaction(() => serveOutbox(ctx, true), user) : await serveOutbox(ctx, false);
      return new Response(JSON.stringify(doc, null, 1), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'inline; filename="to-thisday.json"', ...NO_STORE },
      });
    }
    throw new HttpError(404, "Nicht gefunden.");
  } catch (e) {
    return failure(e);
  }
});

export const POST = withRequestLocale(async (req: Request, { params }: Context) => {
  try {
    const path = ((await params).path || []).join("/");
    if (path) throw new HttpError(404, "Nicht gefunden.");
    await checkOrigin(req);
    const user = await requireUser();
    // Before reading a body of up to 25 MB (lib/daybar/store.ts refuses too).
    refuseReadToken(user);
    const body = await readJsonLimited(req, BODY_LIMIT);
    const { plannerCommand } = await import("@/lib/daybar/store");
    return Response.json(await plannerCommand(user, body), { headers: NO_STORE });
  } catch (e) {
    return failure(e);
  }
});
