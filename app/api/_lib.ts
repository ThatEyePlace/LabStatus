import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
export const LABS=["iCare","Nassau","Marlo"],STATUSES=[
  "Ordered From Lab",
  "In-Process at Lab",
  "Status Check-Still With Lab",
  "Completed at Lab",
  "Shipped from Lab",
  "Received by TEP",
  "In-Process at TEP",
  "Ready for Pickup at TEP",
  "Sent Message for Pickup",
  "Sent Message to Bring Frame",
  "Delivered to Patient",
  "Dispensed at TEP",
];
export async function isAuthenticated(){return (await cookies()).get("labstatus_auth")?.value==="authorized"}
export async function initializeDb(){await env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, first_initial TEXT NOT NULL, last_name TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, lab TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),env.DB.prepare("CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)"),env.DB.prepare("CREATE INDEX IF NOT EXISTS job_events_job_id_idx ON job_events (job_id)")])}
export async function ensureArchiveColumn(){try{await env.DB.prepare("ALTER TABLE jobs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0").run()}catch{}}
export async function hydrateJob(row:Record<string,unknown>){const e=await env.DB.prepare("SELECT id, status, created_at AS createdAt FROM job_events WHERE job_id = ? ORDER BY created_at DESC").bind(row.id).all();return {...row,events:e.results}}
