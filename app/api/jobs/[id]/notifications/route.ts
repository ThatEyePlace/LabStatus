import { DEFAULT_TEMPLATES, validEmail, notificationStatus } from "../../../../../lib/email.mjs";
import { env } from 'cloudflare:workers';
import { isAuthenticated } from '../../../_lib';
import { privateJson } from '../../../_security';
import { sendNotification } from '../../../email/_send';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  if(!(await isAuthenticated()))return privateJson({error:'Unauthorized'},401);
  const id=Number((await context.params).id);if(!Number.isSafeInteger(id)||id<1)return privateJson({error:'Invalid job'},400);
  const rows=await env.DB.prepare('SELECT id,type,recipient,subject,status,detail,actor,created_at AS createdAt,completed_at AS completedAt,provider_status AS providerStatus FROM email_notifications WHERE job_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return privateJson(rows.results);
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  if(!(await isAuthenticated()))return privateJson({error:'Unauthorized'},401);
  const id=Number((await context.params).id);if(!Number.isSafeInteger(id)||id<1)return privateJson({error:'Invalid job'},400);
  const body=await request.json().catch(()=>null);
  const type=body?.type as string;
  if(type!=='ready'&&type!=='reminder'&&type!=='bringFrame')return privateJson({error:'Invalid notification type.'},400);
  const job=await env.DB.prepare('SELECT customer_email AS customerEmail FROM jobs WHERE id=?').bind(id).first<{customerEmail:string}>();
  if(!job)return privateJson({error:'Job not found.'},404);
  if(!validEmail(job.customerEmail))return privateJson({error:'Save a valid customer email address before sending.'},400);
  const saved=await env.DB.prepare('SELECT subject,body FROM email_templates WHERE type=?').bind(type).first<{subject:string;body:string}>();
  const template=saved||DEFAULT_TEMPLATES[type];
  return sendNotification({...template,type,recipient:job.customerEmail,requestId:body.requestId,confirmResend:body.confirmResend===true},id);
}
// Recovery is explicit and never submits a second email.
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  if(!(await isAuthenticated()))return privateJson({error:'Unauthorized'},401);
  const jobId=Number((await context.params).id),body=await request.json().catch(()=>({}));
  const row=await env.DB.prepare('SELECT id,status,type,created_at AS createdAt FROM email_notifications WHERE id=? AND job_id=?').bind(body.requestId||'',jobId).first<{id:string;status:string;type:string;createdAt:string}>();
  if(!row)return privateJson({error:'Notification not found'},404);
  if(row.status==='accepted_status_pending'){
    await env.DB.batch([env.DB.prepare("UPDATE jobs SET status=?,updated_at=? WHERE id=?").bind(notificationStatus(row.type),new Date().toISOString(),jobId),env.DB.prepare("INSERT INTO job_events(job_id,status,created_at) VALUES(?,?,?)").bind(jobId,notificationStatus(row.type),new Date().toISOString()),env.DB.prepare("UPDATE email_notifications SET status='accepted' WHERE id=? AND status='accepted_status_pending'").bind(row.id)]);
  }else if(row.status==='sending'&&Date.now()-Date.parse(row.createdAt)>300000){
    await env.DB.batch([env.DB.prepare("UPDATE email_notifications SET status='unknown',detail='Stalled submission reviewed by staff. Check Outlook Sent Items before resending.' WHERE id=? AND status='sending'").bind(row.id),env.DB.prepare('DELETE FROM email_locks WHERE job_id=? AND request_id=?').bind(jobId,row.id)]);
  }else return privateJson({error:'Only stalled submissions older than five minutes or accepted updates can be reviewed.'},409);
  return privateJson({reviewed:true});
}
