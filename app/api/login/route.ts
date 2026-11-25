import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { runtime, privateJson } from '../_security';
import { sessionToken, sign } from '../../../lib/email.mjs';
export async function POST(request:Request) {
  const config=runtime();
  if(!config.SESSION_SECRET||!config.ACCESS_PIN)return privateJson({error:'Staff access code is not configured. The owner can sign in with ChatGPT.'},503);
  const bucket=await sign(request.headers.get('cf-connecting-ip') || 'unknown',config.SESSION_SECRET);
  const now=Date.now();
  const attempt=await env.DB.prepare('SELECT attempts,started_at AS startedAt FROM staff_login_attempts WHERE bucket=?').bind(bucket).first<{attempts:number;startedAt:number}>();
  if(attempt&&now-attempt.startedAt<900000&&attempt.attempts>=5)return privateJson({error:'Too many attempts. Wait 15 minutes.'},429);
  const body=await request.json().catch(()=>({}));
  if(typeof body.pin!=='string'||body.pin!==config.ACCESS_PIN){await env.DB.prepare('INSERT INTO staff_login_attempts(bucket,attempts,started_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN started_at<? THEN 1 ELSE attempts+1 END,started_at=CASE WHEN started_at<? THEN excluded.started_at ELSE started_at END').bind(bucket,now,now-900000,now-900000).run();return privateJson({error:'Incorrect access code.'},401);}
  await env.DB.prepare('DELETE FROM staff_login_attempts WHERE bucket=?').bind(bucket).run();
  (await cookies()).set('labstatus_auth',await sessionToken(config.SESSION_SECRET),{httpOnly:true,sameSite:'strict',secure:true,maxAge:43200,path:'/'});
  return privateJson({authenticated:true});
}
