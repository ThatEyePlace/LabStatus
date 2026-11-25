import { env } from 'cloudflare:workers';
import { isAuthenticated } from '../../_lib';
import { isOwner, privateJson, runtime } from '../../_security';
import { DEFAULT_TEMPLATES } from '../../../../lib/email.mjs';
export async function GET() {
  if(!(await isAuthenticated()))return privateJson({error:'Unauthorized'},401);
  const saved=await env.DB.prepare('SELECT type,subject,body FROM email_templates').all<{type:'ready'|'reminder';subject:string;body:string}>();
  const templates={...DEFAULT_TEMPLATES};for(const row of saved.results)if(row.type==='ready'||row.type==='reminder')templates[row.type]={subject:row.subject,body:row.body};
  const connection=await env.DB.prepare('SELECT mailbox,connected_at AS connectedAt FROM email_connection WHERE id=1').first();
  const c=runtime();
  return privateJson({templates,connection,owner:await isOwner(),configured:Boolean(c.MS_TENANT_ID&&c.MS_CLIENT_ID&&c.MS_CLIENT_SECRET&&c.SESSION_SECRET)});
}
export async function PUT(request:Request) {
  if(!(await isAuthenticated()))return privateJson({error:'Unauthorized'},401);
  const b=await request.json().catch(()=>null);
  if(!b||!['ready','reminder'].every(t=>typeof b[t]?.subject==='string'&&b[t].subject.trim()&&b[t].subject.length<=200&&!/[\r\n]/.test(b[t].subject)&&typeof b[t]?.body==='string'&&b[t].body.trim()&&b[t].body.length<=12000))return privateJson({error:'Both templates need a subject and message.'},400);
  await env.DB.batch(['ready','reminder'].map(t=>env.DB.prepare('INSERT INTO email_templates(type,subject,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(type) DO UPDATE SET subject=excluded.subject,body=excluded.body,updated_at=excluded.updated_at').bind(t,b[t].subject.trim(),b[t].body,new Date().toISOString())));
  return privateJson({saved:true});
}
export async function DELETE() {
  if(!(await isOwner()))return privateJson({error:'Owner access required'},403);
  await env.DB.prepare('DELETE FROM email_connection WHERE id=1').run();
  return privateJson({disconnected:true});
}
