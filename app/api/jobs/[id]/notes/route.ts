import { env } from "cloudflare:workers";
import { ensureArchiveColumn, ensureRxHoldColumn, hydrateJob, initializeDb, isAuthenticated } from "../../../_lib";

const select = "SELECT id,first_initial AS firstInitial,last_name AS lastName,job_id AS jobId,customer_email AS customerEmail,lab,status,notes,archived,rx_hold AS rxHold,review_link AS reviewLink,created_at AS createdAt,updated_at AS updatedAt FROM jobs WHERE id=?";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = Number((await context.params).id);
  if (!Number.isInteger(jobId)) return Response.json({ error: "Invalid job" }, { status: 400 });
  const body = await request.json() as { action?: "create" | "update" | "delete"; noteId?: number | "legacy"; text?: string };
  await initializeDb();
  await ensureArchiveColumn();
  await ensureRxHoldColumn();
  const existing = await env.DB.prepare("SELECT id FROM jobs WHERE id=?").bind(jobId).first();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString();
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (body.action === "create") {
    if (!text) return Response.json({ error: "Enter a note before saving." }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO job_notes(job_id,note,created_at,updated_at) VALUES(?,?,?,?)").bind(jobId,text,now,now),
      env.DB.prepare("UPDATE jobs SET updated_at=? WHERE id=?").bind(now,jobId),
    ]);
  } else if (body.action === "update") {
    if (!text) return Response.json({ error: "A saved note cannot be blank." }, { status: 400 });
    if (body.noteId === "legacy") {
      await env.DB.prepare("UPDATE jobs SET notes=?,updated_at=? WHERE id=?").bind(text,now,jobId).run();
    } else if (Number.isInteger(body.noteId)) {
      const result = await env.DB.prepare("UPDATE job_notes SET note=?,updated_at=? WHERE id=? AND job_id=?").bind(text,now,body.noteId,jobId).run();
      if (!result.meta.changes) return Response.json({ error: "Note not found" }, { status: 404 });
      await env.DB.prepare("UPDATE jobs SET updated_at=? WHERE id=?").bind(now,jobId).run();
    } else return Response.json({ error: "Invalid note" }, { status: 400 });
  } else if (body.action === "delete") {
    if (body.noteId === "legacy") {
      await env.DB.prepare("UPDATE jobs SET notes='',updated_at=? WHERE id=?").bind(now,jobId).run();
    } else if (Number.isInteger(body.noteId)) {
      const result = await env.DB.prepare("DELETE FROM job_notes WHERE id=? AND job_id=?").bind(body.noteId,jobId).run();
      if (!result.meta.changes) return Response.json({ error: "Note not found" }, { status: 404 });
      await env.DB.prepare("UPDATE jobs SET updated_at=? WHERE id=?").bind(now,jobId).run();
    } else return Response.json({ error: "Invalid note" }, { status: 400 });
  } else return Response.json({ error: "Invalid action" }, { status: 400 });
  const row = await env.DB.prepare(select).bind(jobId).first<Record<string, unknown>>();
  return Response.json(await hydrateJob(row!));
}
