import { env } from "cloudflare:workers";
import { staffAuthenticated } from "./_security";
export const LABS=["iCare","Nassau","Marlo","In-House","Rx-Only"];
export const GLASSES_STATUSES=[
  "1. Ready to Order",
  "2. Ordered From Lab",
  "3. In-Process at Lab",
  "4. Shipped to Lab",
  "5. Status Check-Still With Lab",
  "6. Completed at Lab",
  "7. Shipped from Lab",
  "8. Received by Lab / Same Day",
  "9. In-Process at TEP",
  "10. Ready for Pickup at TEP",
  "11. Sent Message for Pickup",
  "12. Sent Message to Bring Frame",
  "13. Mailed/Delivered to Patient",
  "14. Dispensed at TEP",
  "15. Sent Rx",
  "FAILED / REMAKE",
];
export const CONTACT_STATUSES=[
  "1. Ready to Order",
  "2. Ordered From Lab",
  "3. Shipped from Lab",
  "4. Mailed/Delivered to Patient",
];
export const STATUSES=[...GLASSES_STATUSES,...CONTACT_STATUSES];
export const STARTING_STATUSES=STATUSES.filter(status=>status!=="15. Sent Rx"&&status!=="FAILED / REMAKE");
export const isAuthenticated = staffAuthenticated;
export async function initializeDb(){await env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, first_initial TEXT NOT NULL, last_name TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, lab TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', review_link INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),env.DB.prepare("CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)"),env.DB.prepare("CREATE INDEX IF NOT EXISTS job_events_job_id_idx ON job_events (job_id)")])}
export async function ensureArchiveColumn(){try{await env.DB.prepare("ALTER TABLE jobs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0").run()}catch{}}
export async function ensureRxHoldColumn(){try{await env.DB.prepare("ALTER TABLE jobs ADD COLUMN rx_hold INTEGER NOT NULL DEFAULT 0").run()}catch{}}
const normalizeStatus=(status:unknown)=>status==="8. Received by TEP"?"8. Received by Lab / Same Day":status;
export async function hydrateJob(row:Record<string,unknown>){const[e,n]=await Promise.all([env.DB.prepare("SELECT id, status, created_at AS createdAt FROM job_events WHERE job_id = ? ORDER BY created_at DESC").bind(row.id).all(),env.DB.prepare("SELECT id,note AS text,created_at AS createdAt,updated_at AS updatedAt FROM job_notes WHERE job_id = ? ORDER BY created_at DESC,id DESC").bind(row.id).all()]);const legacy=typeof row.notes==="string"&&row.notes.trim()?([{id:"legacy",text:row.notes,createdAt:row.updatedAt,updatedAt:row.updatedAt,legacy:true}]):[];return {...row,status:normalizeStatus(row.status),events:e.results.map(event=>({...event,status:normalizeStatus(event.status)})),noteEntries:[...n.results,...legacy]}}
