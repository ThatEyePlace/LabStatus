'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { validEmail } from '../lib/email.mjs';
type Template={subject:string;body:string};
type Templates={ready:Template;reminder:Template;bringFrame:Template};
const notificationLabel=(type:string)=>type==='ready'?'Ready for Pickup':type==='reminder'?'Pickup Reminder':type==='bringFrame'?'Bring In Your Frame':'Test';
type Settings={templates:Templates;connection:null|{mailbox:string;connectedAt:string};configured:boolean;owner:boolean};
type Notification={id:string;type:string;recipient:string;subject:string;status:string;detail:string;createdAt:string;completedAt?:string;actor:string};
async function api(path:string,method='GET',body?:unknown){const r=await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||data.notification?.detail||'The request could not be completed.'),{data});return data;}
const stamp=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
function Preview({body}:{body:string}){return <div className="email-preview">{body.split('\n').map((line,i)=><div key={i}>{line.split(/(https:\/\/thateyeplace\.com\/pu)/g).map((part,j)=>part==='https://thateyeplace.com/pu'?<a key={j} href={part} target="_blank" rel="noreferrer">{part}</a>:<span key={j}>{part}</span>)}{!line&&<br/>}</div>)}</div>}
export function EmailAdministration(){
  const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [testOpen,setTestOpen]=useState(false),[testSubject,setTestSubject]=useState('[LabStatus test] Outlook pickup notification'),[testBody,setTestBody]=useState('This is the approved LabStatus integration test. No customer record is involved.\n\nSchedule your pickup:\nhttps://thateyeplace.com/pu');
  useEffect(()=>{api('/api/email/settings').then(setSettings).catch(e=>setError(e.message));},[]);
  async function save(e:FormEvent){e.preventDefault();if(!settings)return;setBusy(true);setError('');try{await api('/api/email/settings','PUT',settings.templates);setNotice('Default templates saved.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function connect(){setBusy(true);setError('');try{const r=await api('/api/email/connect','POST');window.location.assign(r.url);}catch(e){setError((e as Error).message);setBusy(false);}}
  async function test(){setBusy(true);setError('');try{const r=await api('/api/email/test','POST',{type:'test',recipient:'glasses@thateyeplace.com',subject:testSubject,body:testBody,requestId:crypto.randomUUID()});setNotice(r.notification.detail);setTestOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel email-admin no-print"><p className="eyebrow">Administration</p><h2>Email notifications</h2>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{settings&&<><p>Sending account: <strong>glasses@thateyeplace.com</strong></p><p>{settings.connection?`Connected ${stamp(settings.connection.connectedAt)}`:'Outlook is not connected.'}</p>{!settings.configured&&<p>Microsoft app registration is required. In Site settings, configure MS_TENANT_ID, MS_CLIENT_ID and the secret MS_CLIENT_SECRET. Web redirect URI: <code>https://labstatus.anthonyperezabo.chatgpt.site/api/email/callback</code></p>}{settings.owner?<div className="email-buttons"><button disabled={busy||!settings.configured} onClick={connect}>{settings.connection?'Reconnect Outlook':'Connect Outlook'}</button>{settings.connection&&<><button disabled={busy} onClick={()=>setTestOpen(!testOpen)}>Preview approved test email</button><button disabled={busy} onClick={async()=>{if(!confirm('Disconnect Outlook? Pickup emails will stop until reconnected.'))return;setBusy(true);try{await api('/api/email/settings','DELETE');setSettings({...settings,connection:null});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Disconnect Outlook</button></>}</div>:<p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Owner sign-in</a> is required to connect Outlook.</p>}{testOpen&&<div className="email-composer"><h3>Approved integration test</h3><p>To: glasses@thateyeplace.com</p><label>Test subject<input value={testSubject} onChange={e=>setTestSubject(e.target.value)} maxLength={200}/></label><label>Test message<textarea rows={7} value={testBody} onChange={e=>setTestBody(e.target.value)}/></label><Preview body={testBody}/><button disabled={busy} className="primary" onClick={test}>Send approved test email</button></div>}<form onSubmit={save}>{(['ready','reminder','bringFrame'] as const).map(type=><fieldset key={type}><legend>{notificationLabel(type)} default</legend><label>Subject<input required maxLength={200} value={settings.templates[type].subject} onChange={e=>setSettings({...settings,templates:{...settings.templates,[type]:{...settings.templates[type],subject:e.target.value}}})}/></label><label>Message<textarea required maxLength={12000} rows={9} value={settings.templates[type].body} onChange={e=>setSettings({...settings,templates:{...settings.templates,[type]:{...settings.templates[type],body:e.target.value}}})}/></label></fieldset>)}<button className="primary" disabled={busy}>Save default templates</button></form></>}</section>
}
export function JobEmailControls({job,onUpdated}:{job:{id:number;customerEmail?:string;archived?:number};onUpdated:()=>Promise<void>}) {
  const [email,setEmail]=useState(job.customerEmail||'');
  const [history,setHistory]=useState<Notification[]>([]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const sending=useRef(false);
  const attempts=useRef(new Map<string,string>());
  const path=`/api/jobs/${job.id}/notifications`;
  const refresh=async()=>{const rows=await api(path);setHistory(rows);return rows as Notification[];};
  useEffect(()=>{
    let active=true;
    setEmail(job.customerEmail||'');setLoaded(false);setError('');
    Promise.all([api(path),api('/api/email/settings')]).then(([rows,config])=>{
      if(active){setHistory(rows);setSettings(config);setLoaded(true);}
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[job.id,job.customerEmail,path]);
  async function save(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try{await api(`/api/jobs/${job.id}`,'PATCH',{action:'save_email',customerEmail:email});await onUpdated();setNotice('Customer email saved.');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function send(type:'ready'|'reminder'|'bringFrame') {
    if(sending.current||busy||!loaded||!settings?.connection||job.archived)return;
    const recipient=email.trim();
    if(!validEmail(recipient)){setError('Enter a valid customer email address before sending.');return;}
    sending.current=true;setBusy(true);setError('');setNotice('');
    const key=`${job.id}:${type}:${recipient}`;
    try {
      const latest=await refresh();
      const previous=latest.some(n=>['accepted','accepted_status_pending','unknown','sending'].includes(n.status));
      if(previous&&!window.confirm(`A notification for this job was already sent or may have been sent. Check its history and Outlook Sent Items first. Send ${notificationLabel(type)} again to ${recipient}?`))return;
      // Save a changed address as part of the same click, before the server selects its recipient.
      if(recipient!==(job.customerEmail||''))await api(`/api/jobs/${job.id}`,'PATCH',{action:'save_email',customerEmail:recipient});
      const oldId=attempts.current.get(key);
      const oldAttempt=latest.find(n=>n.id===oldId);
      const requestId=previous||oldAttempt?.status==='failed'?crypto.randomUUID():(oldId||crypto.randomUUID());
      attempts.current.set(key,requestId);
      const result=await api(path,'POST',{type,requestId,confirmResend:previous});
      setNotice(`${notificationLabel(type)} sent to ${recipient}. ${result.notification.detail}`);
      attempts.current.delete(key);
      await refresh();await onUpdated();
    } catch(e) {
      setError((e as Error).message);
      await refresh().catch(()=>{});
      // Keep the ID after an unconfirmed request; retrying cannot silently send it twice.
    } finally {sending.current=false;setBusy(false);}
  }
  return <section className="email-controls no-print">
    <h3>Customer email & pickup notifications</h3>
    <form className="email-address" onSubmit={save}>
      <label>Customer email (optional)<input type="email" maxLength={254} autoComplete="off" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
      <button disabled={busy}>Save email</button>
    </form>
    <div className="email-buttons">
      <button className="email-bubble email-bubble-ready" disabled={busy||!loaded||!settings?.connection||Boolean(job.archived)} onClick={()=>send('ready')}>Send Ready for Pickup Email</button>
      <button className="email-bubble email-bubble-reminder" disabled={busy||!loaded||!settings?.connection||Boolean(job.archived)} onClick={()=>send('reminder')}>Send Pickup Reminder</button>
      <button className="email-bubble email-bubble-bringFrame" disabled={busy||!loaded||!settings?.connection||Boolean(job.archived)} onClick={()=>send('bringFrame')}>Send Bring In Your Frame Email</button>
    </div>
    <p className="muted">Click an email bubble to send its saved template immediately. Changing a job status never sends an email.</p>
    {busy&&<p role="status">Working…</p>}
    {!settings?.connection&&loaded&&<p>Connect Outlook in Email administration before sending.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <h4>Notification history</h4>
    {history.length?<div className="notification-history">{history.map(n=><article key={n.id}>
      <strong>{notificationLabel(n.type)} · {n.status==='accepted'?'Microsoft accepted':n.status==='accepted_status_pending'?'Accepted; job status update needs attention':n.status==='sending'?'Unconfirmed submission':n.status}</strong>
      <p>{n.recipient} · {stamp(n.completedAt||n.createdAt)}</p><p>{n.detail}</p><small>{n.actor} · Request {n.id}</small>
      {['sending','accepted_status_pending'].includes(n.status)&&<button disabled={busy} onClick={async()=>{
        if(n.status==='sending'&&!confirm('Check Outlook Sent Items first. This marks a submission older than five minutes as uncertain and releases its lock. It does not resend. Continue?'))return;
        setBusy(true);
        try{await api(path,'PATCH',{requestId:n.id});await refresh();await onUpdated();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
      }}>{n.status==='accepted_status_pending'?'Finish accepted status update':'Review stalled submission'}</button>}
    </article>)}</div>:<p>No notifications recorded.</p>}
  </section>;
}
