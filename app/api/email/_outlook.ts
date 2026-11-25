import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { runtime } from '../_security';
import { SENDER, seal, unseal } from '../../../lib/email.mjs';
export const ORIGIN='https://labstatus.anthonyperezabo.chatgpt.site';
export const REDIRECT_URI=`${ORIGIN}/api/email/callback`;
export const SCOPE='https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send offline_access';
export function configuration() {
  const c=runtime();
  if(!/^[a-f0-9-]{36}$/i.test(c.MS_TENANT_ID||'')||!/^[a-f0-9-]{36}$/i.test(c.MS_CLIENT_ID||'')||!c.MS_CLIENT_SECRET||!c.SESSION_SECRET)throw new Error('Outlook setup is incomplete. Configure MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and SESSION_SECRET in Site settings.');
  return c;
}
export async function tokenRequest(fields:Record<string,string>) {
  const c=configuration();
  const r=await fetch(`https://login.microsoftonline.com/${c.MS_TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.MS_CLIENT_ID,client_secret:c.MS_CLIENT_SECRET,scope:SCOPE,...fields}),signal:AbortSignal.timeout(20000)});
  const data=await r.json() as {access_token?:string;refresh_token?:string;expires_in?:number};
  if(!r.ok||!data.access_token)throw new Error('Microsoft authorization failed. Reconnect Outlook or check the app registration.');
  return data as {access_token:string;refresh_token?:string;expires_in:number};
}
export async function accessToken() {
  const c=configuration();
  const row=await env.DB.prepare('SELECT encrypted_tokens AS encryptedTokens FROM email_connection WHERE id=1').first<{encryptedTokens:string}>();
  if(!row)throw new Error('Connect glasses@thateyeplace.com in Email administration before sending.');
  const tokens=await unseal(row.encryptedTokens,c.SESSION_SECRET);
  if(tokens.expiresAt>Date.now()+120000)return tokens.accessToken as string;
  const fresh=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refreshToken});
  const encrypted=await seal({accessToken:fresh.access_token,refreshToken:fresh.refresh_token||tokens.refreshToken,expiresAt:Date.now()+fresh.expires_in*1000},c.SESSION_SECRET);
  const update=await env.DB.prepare('UPDATE email_connection SET encrypted_tokens=? WHERE id=1 AND encrypted_tokens=?').bind(encrypted,row.encryptedTokens).run();
  if(!update.meta.changes)throw new Error('Outlook connection changed. Refresh this page before sending.');
  return fresh.access_token;
}
export async function finishConnection(code:string,state:string) {
  const c=configuration();
  const jar=await cookies();
  const browserState=jar.get('labstatus_outlook_state')?.value;
  jar.delete('labstatus_outlook_state');
  if(browserState!==state)throw new Error('The connection request expired. Start again.');
  const row=await env.DB.prepare('DELETE FROM email_oauth_states WHERE state=? AND expires_at>? RETURNING encrypted_verifier AS verifier').bind(state,Date.now()).first<{verifier:string}>();
  if(!row)throw new Error('The connection request expired. Start again.');
  const verifier=await unseal(row.verifier,c.SESSION_SECRET);
  const tokens=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:REDIRECT_URI,code_verifier:verifier});
  const profile=await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});
  if(!profile.ok)throw new Error('Microsoft could not verify the sending mailbox.');
  const user=await profile.json() as {mail?:string;userPrincipalName?:string};
  if((user.mail||user.userPrincipalName||'').toLowerCase()!==SENDER)throw new Error(`Sign in to ${SENDER} to connect this site.`);
  if(!tokens.refresh_token)throw new Error('Microsoft did not grant offline access. Reconnect with the required permissions.');
  await env.DB.prepare('INSERT INTO email_connection(id,encrypted_tokens,mailbox,connected_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_tokens=excluded.encrypted_tokens,mailbox=excluded.mailbox,connected_at=excluded.connected_at').bind(await seal({accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:Date.now()+tokens.expires_in*1000},c.SESSION_SECRET),SENDER,new Date().toISOString()).run();
}
