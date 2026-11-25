import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { isOwner, privateJson } from '../../_security';
import { configuration, REDIRECT_URI, SCOPE } from '../_outlook';
import { base64url, seal } from '../../../../lib/email.mjs';
export async function POST() {
  if(!(await isOwner()))return privateJson({error:'The site owner must sign in with ChatGPT to connect Outlook.'},403);
  try {
    const c=configuration(),state=crypto.randomUUID(),verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge=base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    await env.DB.prepare('DELETE FROM email_oauth_states WHERE expires_at<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO email_oauth_states(state,encrypted_verifier,expires_at) VALUES(?,?,?)').bind(state,await seal(verifier,c.SESSION_SECRET),Date.now()+600000).run();
    (await cookies()).set('labstatus_outlook_state',state,{secure:true,httpOnly:true,sameSite:'lax',maxAge:600,path:'/api/email/callback'});
    const query=new URLSearchParams({client_id:c.MS_CLIENT_ID,response_type:'code',redirect_uri:REDIRECT_URI,response_mode:'query',scope:SCOPE,state,code_challenge:challenge,code_challenge_method:'S256',login_hint:'glasses@thateyeplace.com',prompt:'select_account'});
    return privateJson({url:`https://login.microsoftonline.com/${c.MS_TENANT_ID}/oauth2/v2.0/authorize?${query}`});
  } catch(e) {return privateJson({error:e instanceof Error?e.message:'Outlook could not be connected.'},503);}
}
