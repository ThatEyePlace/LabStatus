export const SENDER = 'glasses@thateyeplace.com';
export const PICKUP_STATUS = '11. Sent Message for Pickup';
export const FRAME_STATUS = '12. Sent Message to Bring Frame';
export const notificationStatus = type => type === 'bringFrame' ? FRAME_STATUS : PICKUP_STATUS;
export const DEFAULT_TEMPLATES = {
  bringFrame: {subject:'👓 Time to Bring In Your Frame!',body:"Your eyewear is ready for its next step — now we need your frame! 👓\n\nPlease bring in the frame you would like us to use so we can complete your eyewear.\n\nSchedule your visit:\nhttps://thateyeplace.com/pu\n\nPlease reserve your visit time, as walk-in visits are not guaranteed to be open or staffed for eyewear dispensing.\n\nWe look forward to seeing you and your frame!"},
  ready: {subject:'👓 Your New Eyewear Is Ready!',body:"Great news! Your new eyewear is ready to meet its favorite face — YOURS! 🎉\n\nSchedule your pickup:\nhttps://thateyeplace.com/pu\n\nWhile we love surprise visits, walk-in pickups are not guaranteed, as our office may not be open or staffed for eyewear dispensing.\n\nPlease reserve your pickup time to ensure we're ready for you!\n\nWe can't wait to see you seeing in style!"},
  reminder: {subject:'👓 Your Eyewear Misses You!',body:"Your new eyewear is still waiting for its favorite face — YOURS!\n\nSchedule your pickup:\nhttps://thateyeplace.com/pu\n\nPlease reserve your pickup time, as walk-in pickups are not guaranteed to be open or staffed for eyewear dispensing.\n\nSee you soon!"}
};
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value);
export function validateMessage(input) {
  if (!input || !['ready','reminder','bringFrame','test'].includes(input.type) || !validEmail(input.recipient) || typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 200 || /[\r\n]/.test(input.subject) || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 12000 || !/^[0-9a-f-]{36}$/i.test(input.requestId || '')) throw new Error('Check the recipient, subject, and message.');
  return {type:input.type,recipient:input.recipient.trim(),subject:input.subject.trim(),body:input.body,requestId:input.requestId};
}
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function messageHtml(body) {
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">' + escapeHtml(body).replace(/https:\/\/thateyeplace\.com\/pu\b/g,'<a href="https://thateyeplace.com/pu">https://thateyeplace.com/pu</a>').replace(/\n/g,'<br>') + '</div>';
}
export function base64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unbase64(value) {return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));}
export async function sign(value, secret) {const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));}
export async function sessionToken(secret, now=Date.now()) {const payload=`${now+43200000}.${crypto.randomUUID()}`;return `${payload}.${await sign(payload,secret)}`;}
export async function verifySession(token,secret,now=Date.now()) {if(!secret||!token)return false;const [expires,nonce,signature,...rest]=token.split('.');if(rest.length||!signature||Number(expires)<=now||Number(expires)>now+43200000||!nonce)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);try{return await crypto.subtle.verify('HMAC',key,unbase64(signature),new TextEncoder().encode(`${expires}.${nonce}`));}catch{return false;}}
async function encryptionKey(secret) {return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(value,secret) {const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(secret),new TextEncoder().encode(JSON.stringify(value)));return `${base64url(iv)}.${base64url(cipher)}`;}
export async function unseal(value,secret) {const [iv,cipher]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},await encryptionKey(secret),unbase64(cipher))));}
export async function dispatchGraph(token,message,fetcher=fetch) {
  try {
    const response=await fetcher('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{subject:message.subject,body:{contentType:'HTML',content:messageHtml(message.body)},toRecipients:[{emailAddress:{address:message.recipient}}]},saveToSentItems:true}),signal:AbortSignal.timeout(25000)});
    if(response.status===202)return {status:'accepted',providerStatus:202,detail:'Microsoft accepted the message. Delivery is not yet confirmed.'};
    return {status:response.status>=500?'unknown':'failed',providerStatus:response.status,detail:response.status===401||response.status===403?'Microsoft authorization needs attention. Reconnect Outlook in Email administration.':response.status===429?'Microsoft is limiting requests. Wait before trying again.':response.status>=500?'Microsoft returned an uncertain result. Check Sent Items before resending.':'Microsoft rejected the message. The job status was not changed.'};
  } catch {return {status:'unknown',providerStatus:null,detail:'The connection ended without confirmation. Check Outlook Sent Items before resending.'};}
}
