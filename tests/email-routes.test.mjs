import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {seal} from '../lib/email.mjs';
await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});
await build({stdin:{contents:`export {sendNotification} from './app/api/email/_send.ts'; export * as notifications from './app/api/jobs/[id]/notifications/route.ts'; export * as jobs from './app/api/jobs/route.ts'; export * as job from './app/api/jobs/[id]/route.ts'; export * as settings from './app/api/email/settings/route.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/routes.mjs',plugins:[{name:'test-bindings',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers)$/},a=>({path:a.path,namespace:'test-bindings'}));b.onLoad({filter:/.*/,namespace:'test-bindings'},a=>({contents:a.path==='cloudflare:workers'?'export const env=globalThis.__testEnv;':'export const cookies=async()=>({get:n=>globalThis.__testCookie?{value:globalThis.__testCookie}:undefined}); export const headers=async()=>new Headers(globalThis.__testHeaders);'}));}}]});
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0000_fixed_chamber','0001_lyrical_franklin_storm','0002_closed_blazing_skull','0003_rare_nico_minoru','0004_dashing_justice','0005_freezing_killer_shrike'])sqlite.exec(await readFile(new URL(`../drizzle/${file}.sql`,import.meta.url),'utf8'));
sqlite.exec('ALTER TABLE jobs ADD archived INTEGER NOT NULL DEFAULT 0');
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}};}
const DB={prepare:sql=>statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
globalThis.__testEnv={DB,SESSION_SECRET:'integration-test-secret',MS_TENANT_ID:'11111111-1111-1111-1111-111111111111',MS_CLIENT_ID:'22222222-2222-2222-2222-222222222222',MS_CLIENT_SECRET:'fixture-only',ACCESS_PIN:'fixture-only'};
globalThis.__testHeaders={'oai-authenticated-user-email':'anthonyperezabo@gmail.com'};
const routes=await import('../.sites-runtime/tests/routes.mjs');
const originalFetch=globalThis.fetch;
let calls=0,providerStatus=202;
globalThis.fetch=async(url)=>{assert.equal(url,'https://graph.microsoft.com/v1.0/me/sendMail');calls++;return new Response(null,{status:providerStatus});};
await DB.prepare('INSERT INTO email_connection VALUES(1,?,?,?)').bind(await seal({accessToken:'fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000},globalThis.__testEnv.SESSION_SECRET),'glasses@thateyeplace.com',new Date().toISOString()).run();
const makeJob=async()=>{const now=new Date().toISOString();const r=await DB.prepare('INSERT INTO jobs(first_initial,last_name,job_id,lab,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('T','Test',crypto.randomUUID(),'iCare','10. Ready for Pickup at TEP',now,now).run();return r.meta.last_row_id;};
const msg=()=>({type:'ready',recipient:'approved@example.com',subject:'Ready',body:'Pickup https://thateyeplace.com/pu',requestId:crypto.randomUUID()});
const request=(body)=>new Request('https://test.local/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('anonymous and forged legacy cookies cannot read records, templates, or notification history',async()=>{globalThis.__testHeaders={};globalThis.__testCookie='authorized';assert.equal((await routes.jobs.GET()).status,401);assert.equal((await routes.settings.GET()).status,401);assert.equal((await routes.notifications.GET(request({}),{params:Promise.resolve({id:'1'})})).status,401);assert.equal((await routes.notifications.POST(request(msg()),{params:Promise.resolve({id:'1'})})).status,401);assert.equal(calls,0);globalThis.__testHeaders={'oai-authenticated-user-email':'anthonyperezabo@gmail.com'};});
test('only accepted notification updates job and event; repeating its request ID never sends twice',async()=>{providerStatus=202;const id=await makeJob(),message=msg(),before=calls;assert.equal((await routes.sendNotification(message,id)).status,200);assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'11. Sent Message for Pickup');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM job_events WHERE job_id=?').bind(id).first()).n,1);assert.equal((await routes.sendNotification(message,id)).status,200);assert.equal(calls,before+1);assert.equal((await DB.prepare('SELECT status FROM email_notifications WHERE id=?').bind(message.requestId).first()).status,'accepted');});
test('provider failure and uncertainty preserve the previous job status',async()=>{for(const status of [400,403,429,503]){providerStatus=status;const id=await makeJob(),message=msg();assert.notEqual((await routes.sendNotification(message,id)).status,200);assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'10. Ready for Pickup at TEP');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM job_events WHERE job_id=?').bind(id).first()).n,0);assert.equal((await DB.prepare('SELECT status FROM email_notifications WHERE id=?').bind(message.requestId).first()).status,status>=500?'unknown':'failed');}});
test('resend requires explicit confirmation even if notification type changes',async()=>{providerStatus=202;const id=await makeJob();await routes.sendNotification(msg(),id);const before=calls;assert.equal((await routes.sendNotification({...msg(),type:'reminder'},id)).status,409);assert.equal(calls,before);assert.equal((await routes.sendNotification({...msg(),type:'reminder',confirmResend:true},id)).status,200);assert.equal(calls,before+1);});
test('changing a status never invokes the provider',async()=>{const id=await makeJob(),before=calls;const result=await routes.job.PATCH(request({status:'11. Sent Message for Pickup'}),{params:Promise.resolve({id:String(id)})});assert.equal(result.status,200);assert.equal(calls,before);});
test('concurrent sends are serialized per job',async()=>{providerStatus=202;const id=await makeJob(),before=calls;const responses=await Promise.all([routes.sendNotification(msg(),id),routes.sendNotification(msg(),id)]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(calls,before+1);});
test('missing connection failure is recorded without changing job status',async()=>{await DB.prepare('DELETE FROM email_connection').run();const id=await makeJob(),message=msg(),before=calls;assert.equal((await routes.sendNotification(message,id)).status,503);assert.equal((await DB.prepare('SELECT status FROM email_notifications WHERE id=?').bind(message.requestId).first()).status,'failed');assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'10. Ready for Pickup at TEP');assert.equal(calls,before);});
process.on('exit',()=>{globalThis.fetch=originalFetch;sqlite.close();});

test('frame email completes status 12, reminder completes 11, and a rejected frame email preserves readiness',async()=>{
  await DB.prepare('INSERT INTO email_connection VALUES(1,?,?,?)').bind(await seal({accessToken:'fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000},globalThis.__testEnv.SESSION_SECRET),'glasses@thateyeplace.com',new Date().toISOString()).run();
  for(const [type,expected] of [['bringFrame','12. Sent Message to Bring Frame'],['reminder','11. Sent Message for Pickup']]){providerStatus=202;const id=await makeJob();assert.equal((await routes.sendNotification({...msg(),type},id)).status,200);assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,expected);assert.equal((await DB.prepare('SELECT status FROM job_events WHERE job_id=?').bind(id).first()).status,expected);}
  providerStatus=403;const id=await makeJob();assert.equal((await routes.sendNotification({...msg(),type:'bringFrame'},id)).status,422);assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'10. Ready for Pickup at TEP');
});

test('direct send uses saved recipient and latest template, ignoring browser overrides',async()=>{
  const id=await makeJob();
  await DB.prepare('UPDATE jobs SET customer_email=? WHERE id=?').bind('saved@example.com',id).run();
  await DB.prepare('INSERT INTO email_templates(type,subject,body,updated_at) VALUES(?,?,?,?)').bind('bringFrame','Saved frame subject','Saved frame message https://thateyeplace.com/pu',new Date().toISOString()).run();
  const priorFetch=globalThis.fetch;let payload;
  globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return new Response(null,{status:202});};
  try{
    const requestId=crypto.randomUUID();
    const body={type:'bringFrame',requestId,recipient:'override@example.com',subject:'Ignored override',body:'Ignored body'};
    const before=calls;
    assert.equal((await routes.notifications.POST(request(body),{params:Promise.resolve({id:String(id)})})).status,200);
    assert.equal(payload.message.toRecipients[0].emailAddress.address,'saved@example.com');
    assert.equal(payload.message.subject,'Saved frame subject');
    assert.ok(payload.message.body.content.includes('Saved frame message'));
    assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'12. Sent Message to Bring Frame');
    assert.equal((await routes.notifications.POST(request(body),{params:Promise.resolve({id:String(id)})})).status,200);
    assert.equal(calls,before+1);
  }finally{globalThis.fetch=priorFetch;}
});
test('direct send refuses a job without a saved email before contacting Microsoft',async()=>{
  const id=await makeJob(),before=calls;
  const result=await routes.notifications.POST(request({type:'ready',requestId:crypto.randomUUID()}),{params:Promise.resolve({id:String(id)})});
  assert.equal(result.status,400);assert.equal(calls,before);
  assert.equal((await DB.prepare('SELECT status FROM jobs WHERE id=?').bind(id).first()).status,'10. Ready for Pickup at TEP');
});
