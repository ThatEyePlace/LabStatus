"use client";
import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
const labs = ["iCare", "Nassau", "Marlo"];
const statuses = [
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
type Event = { id:number; status:string; createdAt:string };
type Job = { id:number; firstInitial:string; lastName:string; jobId:string; lab:string; status:string; createdAt:string; updatedAt:string; events:Event[]; archived?:number };
const readable = (value:string) => new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
export default function LabStatusApp() {
  const [authenticated,setAuthenticated]=useState(false), [pin,setPin]=useState(""), [loginError,setLoginError]=useState("");
  const [jobs,setJobs]=useState<Job[]>([]), [selected,setSelected]=useState<Job|null>(null), [query,setQuery]=useState(""), [busy,setBusy]=useState(false), [message,setMessage]=useState("");
  const [view,setView]=useState<"active"|"archive">("active");
  const [form,setForm]=useState({firstInitial:"",lastName:"",jobId:"",lab:labs[0],status:statuses[0]});
  const recordsRef=useRef<HTMLElement>(null),recordRef=useRef<HTMLElement>(null);
  const scrollTo=(ref:RefObject<HTMLElement|null>)=>requestAnimationFrame(()=>ref.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"}));
  const loadJobs=async()=>{const r=await fetch("/api/jobs",{cache:"no-store"});if(r.status===401)return setAuthenticated(false);if(r.ok)setJobs(await r.json());};
  useEffect(()=>{fetch("/api/session").then(r=>r.json()).then(d=>{setAuthenticated(Boolean(d.authenticated));if(d.authenticated)loadJobs();});},[]);
  const filtered=useMemo(()=>{const n=query.trim().toLowerCase();const group=jobs.filter(j=>Boolean(j.archived)===(view==="archive"));return n?group.filter(j=>`${j.firstInitial} ${j.lastName} ${j.jobId} ${j.lab} ${j.status}`.toLowerCase().includes(n)):group;},[jobs,query,view]);
  const login=async(e:FormEvent)=>{e.preventDefault();setLoginError("");const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin})});if(!r.ok)return setLoginError("Incorrect access code.");setPin("");setAuthenticated(true);await loadJobs();};
  const createJob=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage("");const r=await fetch("/api/jobs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});setBusy(false);if(!r.ok)return setMessage("The record could not be saved. Check for a duplicate Job ID.");const job=await r.json() as Job;setForm({firstInitial:"",lastName:"",jobId:"",lab:labs[0],status:statuses[0]});setMessage(`Job ${job.jobId} saved.`);await loadJobs();setSelected(job);};
  const openJob=(job:Job)=>{setSelected(job);scrollTo(recordRef);};
  const addStatus=async(job:Job,status:string)=>{setBusy(true);const r=await fetch(`/api/jobs/${job.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});setBusy(false);if(!r.ok)return setMessage("The status could not be updated.");setMessage(`Job ${job.jobId} updated.`);setSelected(null);await loadJobs();scrollTo(recordsRef);};
  const archiveJob=async(job:Job)=>{if(!window.confirm(`Archive Job ${job.jobId}?`))return;const r=await fetch(`/api/jobs/${job.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"archive"})});if(!r.ok)return setMessage("The record could not be archived.");setSelected(null);setView("archive");setMessage(`Job ${job.jobId} moved to Archive.`);await loadJobs();};
  const restoreJob=async(job:Job)=>{const r=await fetch(`/api/jobs/${job.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"restore"})});if(!r.ok)return setMessage("The record could not be restored.");setSelected(null);setView("active");setMessage(`Job ${job.jobId} restored.`);await loadJobs();};
  const deleteJob=async(job:Job)=>{const password=window.prompt(`Enter password to permanently delete Job ${job.jobId}:`);if(password===null)return;const r=await fetch(`/api/jobs/${job.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({password})});if(r.status===403)return setMessage("Incorrect deletion password.");if(!r.ok)return setMessage("The record could not be deleted.");setSelected(null);setMessage(`Job ${job.jobId} permanently deleted.`);await loadJobs();};
  if(!authenticated)return <main className="login-shell"><form className="login-card" onSubmit={login}><div className="brand-mark">TEP</div><p className="eyebrow">That Eye Place</p><h1>LabStatus</h1><p className="muted">Enter the temporary access code.</p><label htmlFor="pin">Access code</label><input id="pin" inputMode="numeric" type="password" value={pin} onChange={e=>setPin(e.target.value)} autoFocus/>{loginError&&<p className="error" role="alert">{loginError}</p>}<button type="submit" className="primary">Sign in</button></form></main>;
  return <main className="app-shell">
    <header className="topbar no-print"><div><p className="eyebrow">That Eye Place</p><h1>LabStatus</h1></div><div className="header-actions">{selected&&(selected.archived?<button className="quiet" onClick={()=>restoreJob(selected)}>Restore</button>:<button className="archive-button" onClick={()=>archiveJob(selected)}>Archive</button>)}{selected&&<button className="delete-button" onClick={()=>deleteJob(selected)}>Delete</button>}<button className="quiet" onClick={async()=>{await fetch("/api/logout",{method:"POST"});setAuthenticated(false);}}>Sign out</button></div></header>
    <section className="workspace no-print">
      <form className="panel new-job" onSubmit={createJob}><div className="panel-heading"><div><p className="eyebrow">New record</p><h2>Add lab job</h2></div><span className="required-note">All fields required</span></div><div className="form-grid">
        <label>First initial<input required maxLength={1} value={form.firstInitial} onChange={e=>setForm({...form,firstInitial:e.target.value.toUpperCase()})}/></label>
        <label className="wide">Last name<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label>
        <label>Job ID<input required value={form.jobId} onChange={e=>setForm({...form,jobId:e.target.value})}/></label>
        <label>Lab<select value={form.lab} onChange={e=>setForm({...form,lab:e.target.value})}>{labs.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Starting status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      </div><button disabled={busy} className="primary" type="submit">{busy?"Saving…":"Save job & timestamp"}</button>{message&&<p className="success" role="status">{message}</p>}</form>
      <section ref={recordsRef} className="panel records-panel"><div className="panel-heading records-heading"><div><p className="eyebrow">Shared records</p><h2>{view==="active"?"Current jobs":"Archive"}</h2></div><span className="record-count">{filtered.length}</span></div><div className="view-tabs"><button className={view==="active"?"tab active":"tab"} onClick={()=>setView("active")}>Current</button><button className={view==="archive"?"tab active":"tab"} onClick={()=>setView("archive")}>Archive</button></div><input className="search" type="search" placeholder="Search name, job ID, lab, or status" value={query} onChange={e=>setQuery(e.target.value)}/><div className="job-list">{filtered.map(j=><button className="job-row" key={j.id} onClick={()=>openJob(j)}><span><strong>{j.firstInitial}. {j.lastName}</strong><small>Job {j.jobId} · {j.lab}</small></span><span className="row-status">{j.status}<small>{readable(j.updatedAt)}</small></span></button>)}{!filtered.length&&<p className="empty">No matching jobs.</p>}</div></section>
    </section>
    {selected&&<section ref={recordRef} className="record-sheet"><div className="record-actions no-print"><button className="quiet" onClick={()=>{setSelected(null);scrollTo(recordsRef);}}>Close</button><button className="primary" onClick={()=>window.print()}>Print / Save PDF</button></div><div className="print-header"><p className="eyebrow">That Eye Place</p><h2>Lab Job Status Record</h2></div><dl className="record-meta"><div><dt>Patient</dt><dd>{selected.firstInitial}. {selected.lastName}</dd></div><div><dt>Job ID</dt><dd>{selected.jobId}</dd></div><div><dt>Lab</dt><dd>{selected.lab}</dd></div><div><dt>Current status</dt><dd className="status-value">{selected.status}</dd></div></dl><div className="status-update no-print"><label>Record a new status<select defaultValue="" onChange={e=>{if(e.target.value)addStatus(selected,e.target.value);e.currentTarget.value="";}}><option value="" disabled>Select status…</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label></div><div className="history"><h3>Timestamp history</h3>{selected.events.map(x=><div className="history-row" key={x.id}><span>{x.status}</span><time>{readable(x.createdAt)}</time></div>)}</div><footer className="print-footer">Created {readable(selected.createdAt)} · Last updated {readable(selected.updatedAt)}</footer></section>}
  </main>;
}
