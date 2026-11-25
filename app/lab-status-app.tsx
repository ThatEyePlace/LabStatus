"use client";
import {
  FormEvent,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmailAdministration, JobEmailControls } from "./email-controls";
const labs = ["iCare", "Nassau", "Marlo", "In-House", "Rx-Only"];
const glassesStatuses = [
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
const contactStatuses = [
  "1. Ready to Order",
  "2. Ordered From Lab",
  "3. Shipped from Lab",
  "4. Mailed/Delivered to Patient",
];
const statusLists = { glasses: glassesStatuses, contacts: contactStatuses };
type StatusTrack = keyof typeof statusLists;
const glassesWorkflowGroups = [
  glassesStatuses.slice(0, 8),
  glassesStatuses.slice(8, 10),
  glassesStatuses.slice(10, 12),
  glassesStatuses.slice(12, 14),
];
const rxFields = ["Sphere", "Cylinder", "Axis", "Add"] as const,
  powers = Array.from({ length: 161 }, (_, i) => -20 + i * 0.25),
  formatPower = (n: number) =>
    n === 0 ? "0.00" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`,
  rxOptions = (field: string) =>
    field === "Axis"
      ? Array.from({ length: 180 }, (_, i) => String(i))
      : field === "Add"
        ? Array.from({ length: 17 }, (_, i) => formatPower(i * 0.25))
        : field === "Cylinder"
          ? Array.from({ length: 41 }, (_, i) => formatPower(-i * 0.25))
          : powers.map(formatPower),
  rxDefaults = Object.fromEntries(
    ["OD", "OS"].flatMap((eye) =>
      rxFields.map((field) => [
        `${eye}-${field}`,
        field === "Axis" ? "0" : "0.00",
      ]),
    ),
  ) as Record<string, string>;
type Event = { id: number; status: string; createdAt: string };
type NoteEntry = { id: number | "legacy"; text: string; createdAt: string; updatedAt: string; legacy?: boolean };
type Job = {
  id: number;
  customerEmail?: string;
  firstInitial: string;
  lastName: string;
  jobId: string;
  lab: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  events: Event[];
  noteEntries: NoteEntry[];
  archived?: number;
  rxHold?: number;
  reviewLink?: number;
};
const glassesWorkflowStage = (job: Job) => {
  const completed = new Set(job.events.map((event) => event.status));
  if (glassesWorkflowGroups[3].some((status) => completed.has(status)) || glassesWorkflowGroups[2].some((status) => completed.has(status))) return 3;
  if (glassesWorkflowGroups[1].some((status) => completed.has(status))) return 2;
  if (completed.has(glassesStatuses[7])) return 1;
  return 0;
};
const availableGlassesStatuses = (job: Job) => [
  ...glassesWorkflowGroups[glassesWorkflowStage(job)],
  ...(job.rxHold ? ["15. Sent Rx"] : []),
  "FAILED / REMAKE",
];
type PrintableRx = {firstInitial:string;lastName:string;currentJobId:string;glassesActive:boolean;rx:Record<string,string>;glassesNotes?:string;contactActive:boolean;contactType?:string;contactRx:Record<string,string>|null;contactNotes?:string;updatedAt:string};
const blankRxForm = (saved?: PrintableRx) => ({
  glassesActive: false,
  rx: { ...rxDefaults, ...(saved?.glassesActive ? saved.rx : {}) },
  contactActive: false,
  contactType: saved?.contactActive ? saved.contactType ?? "" : "",
  contactRx: { ...rxDefaults, ...(saved?.contactActive ? saved.contactRx : {}) },
});
const readable = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
function RxGrid({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div className="rx-entry">
      <div className="rx-entry-title">
        <h3>{title}</h3>
        <small>
          Sphere: ±20.00 · Cylinder: 0.00 to −10.00 · Axis: 0–179 · Add:
          0.00–+4.00
        </small>
      </div>
      <div className="rx-grid">
        <div></div>
        {rxFields.map((field) => (
          <strong key={field}>{field}</strong>
        ))}
        {["OD", "OS"].map((eye) => (
          <div className="rx-grid-row" key={eye}>
            <strong>{eye}</strong>
            {rxFields.map((field) => (
              <select
                aria-label={`${title} ${eye} ${field}`}
                key={field}
                value={value[`${eye}-${field}`]}
                onChange={(e) =>
                  onChange({ ...value, [`${eye}-${field}`]: e.target.value })
                }
              >
                {rxOptions(field).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function RxPrintTable({title,rx}:{title:string;rx:Record<string,string>}){return <div className="rx-print-table"><h3>{title}</h3><table><thead><tr><th></th>{rxFields.map(field=><th key={field}>{field}</th>)}</tr></thead><tbody>{["OD","OS"].map(eye=><tr key={eye}><th>{eye}</th>{rxFields.map(field=><td key={field}>{rx[`${eye}-${field}`]}</td>)}</tr>)}</tbody></table></div>}
function RxPrintDetails({data}:{data:PrintableRx}){return <>{data.glassesActive&&<><RxPrintTable title="Glasses RX" rx={data.rx}/>{data.glassesNotes&&<div className="rx-print-notes"><strong>Glasses Notes</strong><p>{data.glassesNotes}</p></div>}</>}{data.contactActive&&data.contactRx&&<><p className="contact-type"><strong>Type of Contact:</strong> {data.contactType}</p><RxPrintTable title="Contact Lens RX" rx={data.contactRx}/>{data.contactNotes&&<div className="rx-print-notes"><strong>Contact Notes</strong><p>{data.contactNotes}</p></div>}</>}</>}
export default function LabStatusApp() {
  const [authenticated, setAuthenticated] = useState(false),
    [pin, setPin] = useState(""),
    [loginError, setLoginError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<Job | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [emailAdminOpen,setEmailAdminOpen]=useState(false);
  const [view, setView] = useState<"active" | "archive">("active");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | "legacy" | null>(null);
  const [editNoteDraft, setEditNoteDraft] = useState("");
  const [printRxData,setPrintRxData]=useState<PrintableRx|null>(null),[printMode,setPrintMode]=useState<"rx"|"record"|null>(null);
  const [recordRxData,setRecordRxData]=useState<PrintableRx|null>(null),[recordRxLoading,setRecordRxLoading]=useState(false);
  const [pendingCopyRx,setPendingCopyRx]=useState<PrintableRx|null>(null);
  const [formTrack, setFormTrack] = useState<StatusTrack>("glasses"),
    [recordTrack, setRecordTrack] = useState<StatusTrack>("glasses");
  const [form, setForm] = useState({
    customerEmail: "",
    firstInitial: "",
    lastName: "",
    jobId: "",
    lab: labs[0],
    status: glassesStatuses[0],
  });
  const [rxOpen, setRxOpen] = useState(false),
    [activateRxHold, setActivateRxHold] = useState(false),
    [rxForm, setRxForm] = useState(blankRxForm),
    [rxError, setRxError] = useState("");
  const createWithRx = useRef(false);
  const newJobRef=useRef<HTMLFormElement>(null),recordsRef = useRef<HTMLElement>(null),
    recordRef = useRef<HTMLElement>(null);
  const openRxEditor = (activateHold: boolean, saved?: PrintableRx) => {
    setRxForm(blankRxForm(saved));
    setRxError("");
    setActivateRxHold(activateHold);
    setRxOpen(true);
  };
  const scrollTo = (ref: RefObject<HTMLElement | null>) =>
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      }),
    );
  const loadJobs = async () => {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    if (r.status === 401) return setAuthenticated(false);
    if (r.ok) setJobs(await r.json());
  };
  useEffect(() => {
    const outcome=new URLSearchParams(window.location.search).get("outlook");if(outcome){setEmailAdminOpen(true);setMessage(outcome==="connected"?"Outlook connected successfully.":outcome);window.history.replaceState({},"",window.location.pathname);}
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(Boolean(d.authenticated));
        if (d.authenticated) loadJobs();
      });
  }, []);
  const pickupEmailOnly = Boolean(selected && !selected.archived && selected.status === "10. Ready for Pickup at TEP");
  const savedRecordRx = recordRxData?.currentJobId === selected?.jobId ? recordRxData : null;
  const recordId = selected?.id;
  const recordUpdatedAt = selected?.updatedAt;
  useEffect(() => {
    if (recordId === undefined) {
      setRecordRxData(null);
      setRecordRxLoading(false);
      return;
    }

    const request = new AbortController();
    setRecordRxLoading(true);
    fetch(`/api/rx?jobId=${recordId}`, { cache: "no-store", signal: request.signal })
      .then(async (response) => {
        const rx = response.ok ? await response.json() as PrintableRx : null;
        if (!request.signal.aborted) setRecordRxData(rx);
      })
      .catch(() => {
        if (!request.signal.aborted) setRecordRxData(null);
      })
      .finally(() => {
        if (!request.signal.aborted) setRecordRxLoading(false);
      });
    return () => request.abort();
  }, [recordId, recordUpdatedAt]);
  const filtered = useMemo(() => {
    const n = query.trim().toLowerCase();
    const group = jobs.filter(
      (j) => Boolean(j.archived) === (view === "archive"),
    );
    return n
      ? group.filter((j) =>
          `${j.firstInitial} ${j.lastName} ${j.jobId} ${j.lab} ${j.status} ${(j.noteEntries ?? []).map((note) => note.text).join(" ")}`
            .toLowerCase()
            .includes(n),
        )
      : group;
  }, [jobs, query, view]);
  const login = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!r.ok) { const data=await r.json().catch(()=>({})); return setLoginError(data.error||"Incorrect access code."); }
    setPin("");
    setAuthenticated(true);
    await loadJobs();
  };
  const createJob = async (e: FormEvent) => {
    e.preventDefault();
    const enterRxAfterSave = createWithRx.current;
    const rxBeingCopied = pendingCopyRx;
    createWithRx.current = false;
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!r.ok)
      return setMessage(
        "The record could not be saved. Check for a duplicate Job ID.",
      );
    let job = (await r.json()) as Job;
    if(rxBeingCopied){const copiedRx=await fetch("/api/rx",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jobId:job.id,activateHold:false,glassesActive:rxBeingCopied.glassesActive,rx:rxBeingCopied.rx,glassesNotes:rxBeingCopied.glassesNotes,contactActive:rxBeingCopied.contactActive,contactType:rxBeingCopied.contactType,contactRx:rxBeingCopied.contactRx,contactNotes:rxBeingCopied.contactNotes})});if(!copiedRx.ok){await fetch(`/api/jobs/${job.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})});setBusy(false);return setMessage("The RX could not be copied, so no new record was created.")}job=await copiedRx.json() as Job}
    setPendingCopyRx(null);
    setFormTrack("glasses");
    setForm({
      customerEmail: "",
      firstInitial: "",
      lastName: "",
      jobId: "",
      lab: labs[0],
      status: glassesStatuses[0],
    });
    setMessage(`Job ${job.jobId} saved.`);
    await loadJobs();
    setSelected(job);
    setNotesDraft("");
    setEditingNoteId(null);
    setRecordTrack(formTrack);
    if (enterRxAfterSave) {
      openRxEditor(false);
      scrollTo(recordRef);
    } else {
      setRxOpen(false);
    }
  };
  const openJob = (job: Job) => {
    setSelected(job);
    setNotesDraft("");
    setEditingNoteId(null);
    setRxOpen(false);
    scrollTo(recordRef);
  };
  const changeNote = async (job: Job, action: "create" | "update" | "delete", noteId?: number | "legacy", text?: string) => {
    setBusy(true);
    setMessage("");
    const r = await fetch(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, noteId, text }),
    });
    setBusy(false);
    if (!r.ok) {
      const body = await r.json().catch(() => ({ error: "" })) as { error?: string };
      return setMessage(body.error || "The note could not be saved.");
    }
    const updated = (await r.json()) as Job;
    setSelected(updated);
    setNotesDraft("");
    setEditingNoteId(null);
    setEditNoteDraft("");
    setMessage(action === "delete" ? `Note deleted from Job ${job.jobId}.` : `Note saved for Job ${job.jobId}.`);
    await loadJobs();
  };
  const deleteNote = async (job: Job, note: NoteEntry) => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    await changeNote(job, "delete", note.id);
  };
  const addStatus = async (job: Job, status: string) => {
    let password: string | undefined;
    const reviewLink = [
      "13. Mailed/Delivered to Patient",
      "14. Dispensed at TEP",
    ].includes(status)
      ? window.confirm("Should we send a Google Review Link?")
      : false;
    if (status === "15. Sent Rx") {
      const entered = window.prompt(
        `Enter password to confirm Sent Rx for Job ${job.jobId}:`,
      );
      if (entered === null) return;
      password = entered;
    }
    setBusy(true);
    const r = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, password, reviewLink }),
    });
    setBusy(false);
    if (r.status === 403)
      return setMessage("Incorrect password. RX hold remains active.");
    if (!r.ok) return setMessage("The status could not be updated.");
    setMessage(`Job ${job.jobId} updated.`);
    setSelected(null);
    await loadJobs();
    scrollTo(recordsRef);
  };
  const sendRx = async (e: FormEvent, job: Job) => {
    e.preventDefault();
    if (!rxForm.glassesActive && !rxForm.contactActive) return;
    setBusy(true);
    setRxError("");
    setMessage("");
    let updated: Job;
    try {
      const response = await fetch("/api/rx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          activateHold: activateRxHold,
          ...rxForm,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        return setRxError(body.error || "The prescription could not be saved.");
      }
      updated = await response.json() as Job;
    } catch {
      return setRxError("The prescription could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
    setSelected(updated);
    setRxOpen(false);
    setMessage(
      activateRxHold
        ? `Prescription for Job ${job.jobId} sent to PatientUpdate. RX hold is active.`
        : `Prescription for Job ${job.jobId} saved in PatientUpdate.`,
    );
    await loadJobs();
  };
  const startPrint=async(job:Job,mode:"rx"|"record",afterPrint?:()=>void)=>{setBusy(true);setMessage("");const r=await fetch(`/api/rx?jobId=${job.id}`,{cache:"no-store"});setBusy(false);if(r.ok)setPrintRxData(await r.json() as PrintableRx);else if(mode==="rx"){const body=await r.json().catch(()=>({error:""})) as{error?:string};return setMessage(body.error||"The prescription could not be loaded.")}else setPrintRxData(null);setPrintMode(mode);window.onafterprint=()=>{setPrintRxData(null);setPrintMode(null);window.onafterprint=null;afterPrint?.()};setTimeout(()=>window.print(),75)};
  const copyJob=async(job:Job)=>{setBusy(true);setMessage("");const rxResponse=await fetch(`/api/rx?jobId=${job.id}`,{cache:"no-store"});const rxData=rxResponse.ok?await rxResponse.json() as PrintableRx:null;setBusy(false);const track:StatusTrack=rxData?.contactActive&&!rxData.glassesActive?"contacts":"glasses";setPendingCopyRx(rxData);setFormTrack(track);setForm({customerEmail:job.customerEmail||"",firstInitial:job.firstInitial,lastName:job.lastName,jobId:"",lab:"",status:statusLists[track][0]});setSelected(null);setView("active");setMessage(rxData?`Patient and RX copied from Job ${job.jobId}. Enter the new Job ID, Lab, and Starting Status.`:`Patient copied from Job ${job.jobId}. Enter the new Job ID, Lab, and Starting Status.`);scrollTo(newJobRef)};
  const archiveJob = async (job: Job) => {
    if (job.rxHold)
      return setMessage(
        "Sent Rx must be password-confirmed before this record can be archived.",
      );
    if (!window.confirm(`Archive Job ${job.jobId}?`)) return;
    const r = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    if (r.status === 409)
      return setMessage(
        "Sent Rx must be password-confirmed before this record can be archived.",
      );
    if (!r.ok) return setMessage("The record could not be archived.");
    const archivedJob = (await r.json()) as Job;
    setSelected(archivedJob);
    setView("active");
    await loadJobs();
    await startPrint(archivedJob, "record", () => {
      setSelected(null);
      setMessage(`Job ${job.jobId} moved to Archive.`);
      scrollTo(recordsRef);
    });
  };
  const restoreJob = async (job: Job) => {
    const r = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (!r.ok) return setMessage("The record could not be restored.");
    setSelected(null);
    setView("active");
    setMessage(`Job ${job.jobId} restored.`);
    await loadJobs();
  };
  const deleteJob = async (job: Job) => {
    if (!window.confirm(`Permanently delete Job ${job.jobId}? This cannot be undone.`)) return;
    const r = await fetch(`/api/jobs/${job.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    if (r.status === 401) return setMessage("Your session expired. Sign in again before deleting.");
    if (!r.ok) return setMessage("The record could not be deleted.");
    setSelected(null);
    setMessage(`Job ${job.jobId} permanently deleted.`);
    await loadJobs();
  };
  if (!authenticated)
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={login}>
          <div className="brand-mark">TEP</div>
          <p className="eyebrow">That Eye Place</p>
          <h1>LabStatus</h1>
          <p className="muted">Authorized staff access</p>
          <label htmlFor="pin">Access code</label>
          <input
            id="pin"
            inputMode="numeric"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {loginError && (
            <p className="error" role="alert">
              {loginError}
            </p>
          )}
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Owner sign-in with ChatGPT</a><button type="submit" className="primary">
            Sign in
          </button>
        </form>
      </main>
    );
  return (
    <main className="app-shell">
      <header className="topbar no-print">
        <div>
          <p className="eyebrow">That Eye Place</p>
          <h1>LabStatus</h1>
        </div>
        <div className="header-actions"><button className="quiet" onClick={()=>setEmailAdminOpen(!emailAdminOpen)}>Email administration</button>
          {selected && !pickupEmailOnly && (
            <button
              className="delete-button"
              onClick={() => deleteJob(selected)}
            >
              Delete
            </button>
          )}
          <button
            className="quiet"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              setAuthenticated(false);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {emailAdminOpen&&<EmailAdministration/>}
      <section className="workspace no-print">
        <form ref={newJobRef} className="panel new-job" onSubmit={createJob}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">New record</p>
              <h2>Add lab job</h2>
            </div>
            <span className="required-note">Customer email optional</span>
          </div>
          <div className="form-grid">
            <label>
              First initial
              <input
                required
                maxLength={1}
                value={form.firstInitial}
                onChange={(e) =>
                  setForm({
                    ...form,
                    firstInitial: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="wide">
              Last name
              <input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label>
              Job ID
              <input
                required
                value={form.jobId}
                onChange={(e) => setForm({ ...form, jobId: e.target.value })}
              />
            </label>
            <label>
              Lab
              <select
                required
                value={form.lab}
                onChange={(e) => setForm({ ...form, lab: e.target.value })}
              >
                <option value="" disabled>Select lab…</option>
                {labs.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="wide">Customer email (optional)<input type="email" maxLength={254} autoComplete="off" value={form.customerEmail} onChange={e=>setForm({...form,customerEmail:e.target.value})}/></label>
            <div className="wide status-picker">
              <span className="field-label">Starting status</span>
              <div
                className="status-track"
                role="group"
                aria-label="Status type"
              >
                <button
                  type="button"
                  className={formTrack === "glasses" ? "active" : ""}
                  onClick={() => {
                    setFormTrack("glasses");
                    setForm({ ...form, status: glassesStatuses[0] });
                  }}
                >
                  Glasses
                </button>
                <button
                  type="button"
                  className={formTrack === "contacts" ? "active" : ""}
                  onClick={() => {
                    setFormTrack("contacts");
                    setForm({ ...form, status: contactStatuses[0] });
                  }}
                >
                  Contacts
                </button>
              </div>
              <select
                aria-label={`${formTrack} starting status`}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {statusLists[formTrack]
                  .filter((x, index) =>
                    formTrack === "glasses"
                      ? index < 8
                      : x !== "15. Sent Rx" && x !== "FAILED / REMAKE",
                  )
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="new-job-actions">
            <button
              disabled={busy}
              className="primary"
              type="submit"
              onClick={() => {
                createWithRx.current = false;
              }}
            >
              {busy ? "Saving…" : "Save job & timestamp"}
            </button>
            <button
              disabled={busy}
              className="enter-rx-button"
              type="submit"
              onClick={() => {
                createWithRx.current = true;
              }}
            >
              {busy ? "Saving…" : "ENTER RX"}
            </button>
          </div>
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
        </form>
        <section ref={recordsRef} className="panel records-panel">
          <div className="panel-heading records-heading">
            <div>
              <p className="eyebrow">Shared records</p>
              <h2>{view === "active" ? "Current jobs" : "Archive"}</h2>
            </div>
            <span className="record-count">{filtered.length}</span>
          </div>
          <div className="view-tabs">
            <button
              className={view === "active" ? "tab active" : "tab"}
              onClick={() => setView("active")}
            >
              Current
            </button>
            <button
              className={view === "archive" ? "tab active" : "tab"}
              onClick={() => setView("archive")}
            >
              Archive
            </button>
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search name, job ID, lab, or status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="job-list">
            {filtered.map((j) => (
              <button
                className={j.rxHold ? "job-row rx-hold" : "job-row"}
                key={j.id}
                onClick={() => openJob(j)}
              >
                <span>
                  <strong>
                    {j.firstInitial}. {j.lastName}
                  </strong>
                  <small>
                    Job {j.jobId} · {j.lab}
                  </small>
                  {Boolean(j.rxHold) && (
                    <small className="rx-warning">SEND RX REQUIRED</small>
                  )}
                </span>
                <span className="row-status">
                  {j.status}
                  <small>{readable(j.updatedAt)}</small>
                </span>
              </button>
            ))}
            {!filtered.length && <p className="empty">No matching jobs.</p>}
          </div>
        </section>
      </section>
      {selected && (
        <section
          ref={recordRef}
          className={
            selected.rxHold ? "record-sheet rx-hold-sheet" : "record-sheet"
          }
        >
          <div className="record-actions no-print">
            <button
              className="quiet"
              onClick={() => {
                setSelected(null);
                setRecordRxData(null);
                setRxOpen(false);
                scrollTo(recordsRef);
              }}
            >
              Close
            </button>
            {!pickupEmailOnly && <>{selected.archived ? (
              <button className="quiet" onClick={() => restoreJob(selected)}>
                Restore
              </button>
            ) : (
              <>
                <button
                  className="enter-rx-button"
                  disabled={busy || recordRxLoading}
                  onClick={() => openRxEditor(false, savedRecordRx ?? undefined)}
                >
                  ENTER RX
                </button>
                <button
                  className="send-rx-button"
                  disabled={busy || recordRxLoading || Boolean(selected.rxHold)}
                  onClick={() => openRxEditor(true, savedRecordRx ?? undefined)}
                >
                  {selected.rxHold ? "RX HOLD ACTIVE" : "SEND RX"}
                </button>
                <button
                  className="archive-button"
                  disabled={Boolean(selected.rxHold)}
                  onClick={() => archiveJob(selected)}
                >
                  Archive
                </button>
              </>
            )}
            <button className="quiet" disabled={busy} onClick={() => copyJob(selected)}>
              COPY RECORD
            </button>
            <button className="primary" disabled={busy} onClick={() => startPrint(selected,"record")}>
              Print / Save PDF
            </button></>}
          </div>
          {pickupEmailOnly&&<p className="pickup-email-step no-print">Ready for pickup: choose an email below. Microsoft must accept the message before the notification status is recorded.</p>}
          <JobEmailControls job={selected} onUpdated={async()=>{const response=await fetch("/api/jobs",{cache:"no-store"});if(!response.ok)return;const updated=await response.json() as Job[];setJobs(updated);setSelected(updated.find(j=>j.id===selected.id)||null);}}/>
          {!pickupEmailOnly && rxOpen && (!selected.rxHold || !activateRxHold) && (
            <form
              className="rx-send-form no-print"
              onSubmit={(e) => sendRx(e, selected)}
            >
              <div className="rx-form-heading">
                <div>
                  <p className="eyebrow">
                    {activateRxHold ? "Send RX & Hold" : "Enter RX"}
                  </p>
                  <h2>
                    {selected.firstInitial}. {selected.lastName} · Job{" "}
                    {selected.jobId}
                  </h2>
                </div>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setRxOpen(false)}
                >
                  Cancel
                </button>
              </div>
              <fieldset className="rx-choice">
                <legend>Select one or both prescriptions</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={rxForm.glassesActive}
                    onChange={(e) =>
                      setRxForm({ ...rxForm, glassesActive: e.target.checked })
                    }
                  />
                  <span>Glasses RX{savedRecordRx?.glassesActive ? " (saved)" : ""}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={rxForm.contactActive}
                    onChange={(e) =>
                      setRxForm({ ...rxForm, contactActive: e.target.checked })
                    }
                  />
                  <span>Contact Lens RX{savedRecordRx?.contactActive ? " (saved)" : ""}</span>
                </label>
              </fieldset>
              {rxForm.glassesActive && (
                <RxGrid
                  title="Glasses RX"
                  value={rxForm.rx}
                  onChange={(rx) => setRxForm({ ...rxForm, rx })}
                />
              )}
              {rxForm.contactActive && (
                <div className="contact-exam">
                  <label>
                    Type of Contact being dispensed
                    <input
                      required
                      value={rxForm.contactType}
                      onChange={(e) =>
                        setRxForm({ ...rxForm, contactType: e.target.value })
                      }
                      placeholder="Enter contact type"
                    />
                  </label>
                  <RxGrid
                    title="Contact Lens RX"
                    value={rxForm.contactRx}
                    onChange={(contactRx) =>
                      setRxForm({ ...rxForm, contactRx })
                    }
                  />
                </div>
              )}
              {rxError && <p className="error" role="alert">{rxError}</p>}
              <button
                disabled={busy || (!rxForm.glassesActive && !rxForm.contactActive)}
                className="primary rx-submit"
              >
                {busy
                  ? "Saving…"
                  : activateRxHold
                    ? "Send prescription & activate hold"
                    : "Save prescription"}
              </button>
            </form>
          )}
          {Boolean(selected.rxHold) && (
            <div className="rx-hold-banner no-print">
              <strong>SEND RX REQUIRED</strong>
              <span>
                Continue normal status updates. Select “Sent Rx” and enter the
                password to clear this hold and enable Archive.
              </span>
            </div>
          )}
          {printMode === "record" && Boolean(selected.archived) && Boolean(selected.reviewLink) && (
            <div className="review-link-print-reminder">
              <span className="review-checkbox" aria-hidden="true"></span>
              <strong>SEND GOOGLE REVIEW LINK</strong>
            </div>
          )}
          <div className="print-header">
            <p className="eyebrow">That Eye Place</p>
            <h2>Lab Job Status Record</h2>
          </div>
          <dl className="record-meta">
            <div>
              <dt>Patient</dt>
              <dd>
                {selected.firstInitial}. {selected.lastName}
              </dd>
            </div>
            <div>
              <dt>Job ID</dt>
              <dd>{selected.jobId}</dd>
            </div>
            <div>
              <dt>Lab</dt>
              <dd>{selected.lab}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd className="status-value">{selected.status}</dd>
            </div>
          </dl>
          {!pickupEmailOnly && <section className="record-notes-editor no-print">
            <div className="record-notes-heading">
              <h3>Add Note</h3>
              <small>{notesDraft.length}/4000</small>
            </div>
            <textarea
              rows={5}
              maxLength={4000}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add notes for this job…"
              aria-label="Job notes"
            />
            <button
              type="button"
              className="primary"
              disabled={busy || !notesDraft.trim()}
              onClick={() => changeNote(selected, "create", undefined, notesDraft)}
            >
              {busy ? "Saving…" : "Save New Note"}
            </button>
          </section>}
          {!!selected.noteEntries?.length && (
            <section className="saved-notes no-print">
              <h3>Saved Notes</h3>
              {selected.noteEntries.map((note) => (
                <article className="saved-note" key={String(note.id)}>
                  {!pickupEmailOnly && editingNoteId === note.id ? (
                    <>
                      <textarea rows={4} maxLength={4000} value={editNoteDraft} onChange={(e) => setEditNoteDraft(e.target.value)} aria-label="Edit note" />
                      <div className="saved-note-actions">
                        <button type="button" className="primary" disabled={busy || !editNoteDraft.trim()} onClick={() => changeNote(selected, "update", note.id, editNoteDraft)}>Save Changes</button>
                        <button type="button" className="quiet" onClick={() => { setEditingNoteId(null); setEditNoteDraft(""); }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{note.text}</p>
                      <div className="saved-note-footer">
                        <time>{readable(note.createdAt)}{note.updatedAt !== note.createdAt ? " · Edited" : ""}</time>
                        {!pickupEmailOnly && <div className="saved-note-actions">
                          <button type="button" className="quiet" onClick={() => { setEditingNoteId(note.id); setEditNoteDraft(note.text); }}>Edit</button>
                          <button type="button" className="delete-button" onClick={() => deleteNote(selected, note)}>Delete</button>
                        </div>}
                      </div>
                    </>
                  )}
                </article>
              ))}
            </section>
          )}
          {!!selected.noteEntries?.length && (
            <section className="record-notes-print">
              <h3>Notes</h3>
              {selected.noteEntries.map((note) => <div className="printed-note" key={String(note.id)}><p>{note.text}</p><time>{readable(note.createdAt)}{note.updatedAt !== note.createdAt ? " · Edited" : ""}</time></div>)}
            </section>
          )}
          {!pickupEmailOnly && <div className="status-update no-print">
            <span className="field-label">Record a new status</span>
            <div
              className="status-track"
              role="group"
              aria-label="Status type"
            >
              <button
                type="button"
                className={recordTrack === "glasses" ? "active" : ""}
                onClick={() => setRecordTrack("glasses")}
              >
                Glasses
              </button>
              <button
                type="button"
                className={recordTrack === "contacts" ? "active" : ""}
                onClick={() => setRecordTrack("contacts")}
              >
                Contacts
              </button>
            </div>
            <select
              aria-label={`${recordTrack} status`}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addStatus(selected, e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="" disabled>
                Select {recordTrack} status…
              </option>
              {(recordTrack === "glasses"
                ? availableGlassesStatuses(selected)
                : statusLists.contacts
              ).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>}
          <div className="history">
            <h3>Timestamp history</h3>
            {selected.events.map((x) => (
              <div className="history-row" key={x.id}>
                <span>{x.status}</span>
                <time>{readable(x.createdAt)}</time>
              </div>
            ))}
          </div>
          {recordRxLoading && <p className="record-rx-loading no-print">Loading prescription…</p>}
          {savedRecordRx && (
            <section className="record-rx-details no-print">
              <h3>Prescriptions</h3>
              <RxPrintDetails data={savedRecordRx} />
            </section>
          )}
          {printMode === "record" && printRxData && (
            <section className="status-rx-attachment">
              <h3>Prescriptions</h3>
              <RxPrintDetails data={printRxData} />
            </section>
          )}
          <footer className="print-footer">
            Created {readable(selected.createdAt)} · Last updated{" "}
            {readable(selected.updatedAt)}
          </footer>
        </section>
      )}
      {printMode==="rx"&&printRxData&&<section className="rx-print-sheet"><div className="print-header"><p className="eyebrow">That Eye Place</p><h2>Prescription</h2></div><dl className="record-meta"><div><dt>Patient</dt><dd>{printRxData.firstInitial}. {printRxData.lastName}</dd></div><div><dt>Job ID</dt><dd>{printRxData.currentJobId}</dd></div><div><dt>Updated</dt><dd>{readable(printRxData.updatedAt)}</dd></div></dl><RxPrintDetails data={printRxData}/></section>}
    </main>
  );
}
