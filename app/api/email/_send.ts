import { env } from 'cloudflare:workers';
import { accessToken } from './_outlook';
import { privateJson, staffName } from '../_security';
import { dispatchGraph, validateMessage, notificationStatus } from '../../../lib/email.mjs';
export async function sendNotification(input:unknown,jobId:number|null) {
  let message;
  try{message=validateMessage(input);}catch{return privateJson({error:'Check the recipient, subject, and message.'},400);}
  if((jobId===null)!==(message.type==='test'))return privateJson({error:'Invalid notification type.'},400);
  const previous=await env.DB.prepare('SELECT id,status,detail FROM email_notifications WHERE id=?').bind(message.requestId).first();
  if(previous)return privateJson({notification:previous,replayed:true},previous.status==='accepted'?200:409);
  const now=new Date().toISOString();
  if(jobId!==null){
    const job=await env.DB.prepare('SELECT archived FROM jobs WHERE id=?').bind(jobId).first<{archived:number}>();
    if(!job)return privateJson({error:'Job not found'},404);
    if(job.archived)return privateJson({error:'Restore the job before sending a notification.'},409);
  }
  const actor=await staffName();
  try{
    await env.DB.batch([
      ...(jobId!==null?[env.DB.prepare('INSERT INTO email_locks(job_id,request_id) VALUES(?,?)').bind(jobId,message.requestId)]:[]),
      env.DB.prepare('INSERT INTO email_notifications(id,job_id,type,recipient,subject,status,detail,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(message.requestId,jobId,message.type,message.recipient,message.subject,'sending','Waiting for Microsoft acceptance.',actor,now)
    ]);
  }catch{return privateJson({error:'A notification is already being submitted for this job. Refresh its history before sending again.'},409);}
  if(jobId!==null){
    const prior=await env.DB.prepare("SELECT id FROM email_notifications WHERE job_id=? AND id<>? AND status IN ('accepted','accepted_status_pending','unknown','sending') LIMIT 1").bind(jobId,message.requestId).first();
    if(prior && !(input as {confirmResend?:boolean}).confirmResend){await env.DB.batch([env.DB.prepare('DELETE FROM email_locks WHERE job_id=? AND request_id=?').bind(jobId,message.requestId),env.DB.prepare('DELETE FROM email_notifications WHERE id=?').bind(message.requestId)]);return privateJson({error:'A previous notification exists or may have been sent. Review its history and explicitly confirm resending.',resendRequired:true},409);}
  }
  let token;
  try{token=await accessToken();}catch(e){
    const detail=e instanceof Error?e.message:'Reconnect Outlook before sending.';
    await env.DB.batch([env.DB.prepare("UPDATE email_notifications SET status='failed',detail=?,completed_at=? WHERE id=?").bind(detail,new Date().toISOString(),message.requestId),...(jobId!==null?[env.DB.prepare('DELETE FROM email_locks WHERE job_id=? AND request_id=?').bind(jobId,message.requestId)]:[])]);
    return privateJson({error:detail},503);
  }
  const result=await dispatchGraph(token,message);
  const completedAt=new Date().toISOString();
  try{
    // Persist acceptance first: a later job-update failure must never invite another send.
    await env.DB.prepare('UPDATE email_notifications SET status=?,detail=?,completed_at=?,provider_status=? WHERE id=?').bind(result.status==='accepted'&&jobId!==null?'accepted_status_pending':result.status,result.detail,completedAt,result.providerStatus,message.requestId).run();
    if(result.status==='accepted'&&jobId!==null){
      await env.DB.batch([
        env.DB.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=?').bind(notificationStatus(message.type),completedAt,jobId),
        env.DB.prepare('INSERT INTO job_events(job_id,status,created_at) VALUES(?,?,?)').bind(jobId,notificationStatus(message.type),completedAt),
        env.DB.prepare("UPDATE email_notifications SET status='accepted' WHERE id=?").bind(message.requestId)
      ]);
    }
  }catch{
    return privateJson({error:result.status==='accepted'?'Microsoft accepted the message, but its job record could not be fully updated. Do not resend; refresh notification history.':'The send result could not be recorded. Check Outlook Sent Items before resending.',requestId:message.requestId},503);
  }finally{
    // A failed audit write leaves a sending record. It is shown as uncertain, never automatically retried.
    if(jobId!==null)await env.DB.prepare('DELETE FROM email_locks WHERE job_id=? AND request_id=?').bind(jobId,message.requestId).run();
  }
  return privateJson({notification:{id:message.requestId,...result,createdAt:now,completedAt,recipient:message.recipient,type:message.type}},result.status==='accepted'?200:result.status==='unknown'?502:422);
}
