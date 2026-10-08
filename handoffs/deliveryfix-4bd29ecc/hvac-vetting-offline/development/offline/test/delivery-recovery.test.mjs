import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join, dirname, basename} from 'node:path';
import {makeFixture} from './fixture.mjs';
import {appendQcRound, sealQcRound, gateFindings} from '../lib/contract.mjs';
import {DEFAULT_QC_ROOT} from '../lib/qc-ledger.mjs';
import {deliverOffline} from '../lib/delivery.mjs';
import {digest, sha256} from '../lib/common.mjs';

const out = new URL('../test-output/', import.meta.url).pathname;
await fs.mkdir(out, {recursive:true});
async function setup() {
  const dir = await fs.mkdtemp(join(out, 'delivery-recovery-'));
  const sources=join(dir,'sources'), store=join(dir,'store');
  const input=await makeFixture(sources,{count:1});
  return {dir,sources,store,input};
}
const deliver = (s,input=s.input) => deliverOffline({input,sourceRoot:s.sources,storeRoot:s.store});
const jobId = input => digest({owner_id:input.owner_id,project_id:input.project.id,report_event_id:input.report_event_id});
async function files(root) {
  const result=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})) {
    const path=join(root,entry.name);
    if(entry.isDirectory()) result.push(...await files(path));
    else result.push({path,sha256:sha256(await fs.readFile(path))});
  }
  return result;
}
async function failBeforeJournal(s) {
  let injected=false;
  const original=fs.rename;
  const patched=mock.method(fs,'rename',async(from,to)=>{
    if(!injected && basename(to)==='journal.json') {
      injected=true;
      const error=new Error('Synthetic filesystem ENOSPC before journal publication');error.code='ENOSPC';throw error;
    }
    return original(from,to);
  });
  syncBuiltinESMExports();
  try {await assert.rejects(()=>deliver(s),e=>e.code==='ENOSPC');}
  finally {patched.mock.restore();syncBuiltinESMExports();}
  assert.equal(injected,true);
}

test('historical replay: deliver A, genuinely revise Finding and deliver B, exact A remains idempotent',async()=>{
  const s=await setup(), original=structuredClone(s.input);
  const a=await deliver(s,original);
  const originalReceiptHash=sha256(await fs.readFile(a.receipt));
  let revised=structuredClone(original);
  revised.findings[0].description='Actually revised synthetic Finding after delivery A；';
  revised=appendQcRound(revised,sealQcRound(revised,'pass','SYNTHETIC-REPLAY-QC-2'));
  revised.report_event_id='SYNTHETIC-EXPORT-B';
  const b=await deliver(s,revised);
  assert.equal(b.version,'2.0');
  const lineage=join(DEFAULT_QC_ROOT,digest({owner_id:original.owner_id,project_id:original.project.id,review_id:original.review_id}));
  const ledgerBefore=await files(lineage);
  let replay;
  try {replay=await deliver(s,original);} catch(e) {console.log('REPRO historical replay:',e.code,'fixture:',s.dir);throw e;}
  assert.equal(replay.report,a.report);assert.equal(replay.version,'1.0');assert.equal(replay.report_sha256,a.report_sha256);
  assert.equal((await fs.readdir(join(s.store,'jobs'))).length,2);
  const active=JSON.parse(await fs.readFile(join(s.store,'active-index.json'),'utf8'));
  assert.equal(Object.values(active.active)[0].version,'2.0');
  assert.equal(sha256(await fs.readFile(replay.receipt)),originalReceiptHash);
  assert.equal(sha256(await fs.readFile(a.report)),a.report_sha256);
  assert.deepEqual(await files(lineage),ledgerBefore,'Historical replay never truncates or appends QC receipts');
});

test('initialization failure: retained evidence does not block an unrelated event or exact retry',async()=>{
  const s=await setup();await failBeforeJournal(s);
  const before=await files(s.store);
  assert.ok(before.length>0,'Failure evidence must exist');
  assert.equal(before.filter(f=>f.path.endsWith('.xlsx')).length,0);
  const other=structuredClone(s.input);other.report_event_id='SYNTHETIC-UNRELATED';
  let b;
  try {b=await deliver(s,other);} catch(e) {console.log('REPRO unrelated job after ENOSPC:',e.code,'fixture:',s.dir);throw e;}
  const a=await deliver(s), replay=await deliver(s);
  assert.notEqual(a.version,b.version);assert.equal(a.report,replay.report);
  for(const f of before) assert.equal(sha256(await fs.readFile(f.path)),f.sha256,'Incomplete evidence retained: '+f.path);
  assert.equal((await fs.readdir(join(s.store,'jobs'))).length,2);
  assert.equal((await files(join(s.store,'reports'))).filter(f=>f.path.endsWith('.xlsx')).length,2);
  console.log('RECOVERY versions:',{unrelated:b.version,retry:a.version},'fixture:',s.dir);
});

const rejectsCode=(work,code)=>assert.rejects(work,e=>e.code===code);
async function deliveredRevisions() {
  const s=await setup(), original=structuredClone(s.input), a=await deliver(s);
  let revised=structuredClone(original);
  revised.findings[0].description='Genuine revised synthetic Finding for guard regression；';
  revised=appendQcRound(revised,sealQcRound(revised,'pass','SYNTHETIC-GUARD-QC-2'));
  revised.report_event_id='SYNTHETIC-GUARD-B';const b=await deliver(s,revised);
  return {s,original,revised,a,b};
}
const lineageDir=input=>join(DEFAULT_QC_ROOT,digest({owner_id:input.owner_id,project_id:input.project.id,review_id:input.review_id}));

test('replay guards: shorter history cannot start a new event, change store, clear rounds, or change completed payload',async()=>{
  const {s,original,revised}=await deliveredRevisions();
  const stale=structuredClone(original);stale.report_event_id='SYNTHETIC-NEW-WORK';
  await rejectsCode(()=>deliver(s,stale),'QC_HISTORY_RESET');
  await rejectsCode(()=>deliverOffline({input:original,sourceRoot:s.sources,storeRoot:join(s.dir,'other-store')}),'QC_HISTORY_RESET');
  const cleared=structuredClone(revised);cleared.qc.rounds=[];cleared.report_event_id='SYNTHETIC-CLEARED';
  await rejectsCode(()=>deliver(s,cleared),'QC_HISTORY_RESET');
  const changed=structuredClone(original);changed.findings[0].description='Conflicting original report event；';
  await rejectsCode(()=>deliver(s,changed),'REPORT_EVENT_CONFLICT');
  assert.equal((await fs.readdir(join(s.store,'jobs'))).length,2);
  assert.equal((await files(lineageDir(original))).length,2);
});

test('replay validates the whole persisted ledger, including a tampered later receipt',async()=>{
  const {s,original,a}=await deliveredRevisions();
  const dir=lineageDir(original),name=(await fs.readdir(dir)).find(n=>n.startsWith('round-2-'));
  const path=join(dir,name),round=JSON.parse(await fs.readFile(path,'utf8'));
  round.decisions[0].reason='Synthetic tamper in later persisted receipt';await fs.writeFile(path,JSON.stringify(round));
  await rejectsCode(()=>deliver(s,original),'QC_RECEIPT_TAMPERED');
  assert.equal(sha256(await fs.readFile(a.report)),a.report_sha256);
  assert.equal((await fs.readdir(dir)).length,2,'No truncation or repair of tampered history');
});

test('three-round budget survives historical replay; a fourth round and shorter new work remain rejected',async()=>{
  const {s,original,revised,a}=await deliveredRevisions();
  let third=structuredClone(revised);third.findings[0].description='Actual third synthetic Finding revision；';
  third=appendQcRound(third,sealQcRound(third,'pass','SYNTHETIC-GUARD-QC-3'));
  third.report_event_id='SYNTHETIC-GUARD-C';assert.equal((await deliver(s,third)).version,'3.0');
  assert.equal((await deliver(s,original)).report,a.report);
  assert.throws(()=>appendQcRound(third,sealQcRound(third,'pass','SYNTHETIC-GUARD-QC-4')),e=>e.code==='QC_THREE_ROUND_LIMIT');
  revised.report_event_id='SYNTHETIC-STALE-NEW';await rejectsCode(()=>deliver(s,revised),'QC_HISTORY_RESET');
  assert.equal((await files(lineageDir(original))).length,3);
});

test('replay still checks source bytes and the saved immutable input/gate',async()=>{
  const {s,original,a}=await deliveredRevisions();
  const path=join(s.sources,'SYNTHETIC-source.txt'), bytes=await fs.readFile(path);
  await fs.writeFile(path,Buffer.concat([bytes,Buffer.from('SYNTHETIC unexpected source revision\n')]));
  await rejectsCode(()=>deliver(s,original),'EVIDENCE_CHANGED_SINCE_PREPARATION');
  await fs.writeFile(path,bytes);
  const saved=join(s.store,'jobs',jobId(original),'input.json');
  const changed=structuredClone(original);changed.findings[0].description='Synthetic saved-input tamper；';
  await fs.writeFile(saved,JSON.stringify(changed));
  await rejectsCode(()=>deliver(s,original),'STORED_INPUT_MISMATCH');
  assert.equal(sha256(await fs.readFile(a.report)),a.report_sha256);
});

test('unfinished reserved delivery cannot use the completed historical replay exception',async()=>{
  const s=await setup(),original=structuredClone(s.input);
  await rejectsCode(()=>deliverOffline({input:original,sourceRoot:s.sources,storeRoot:s.store,failAt:'after-reserved'}),'SIMULATED_INTERRUPTION');
  let revised=structuredClone(original);revised.findings[0].description='Revised Finding while first delivery remains reserved；';
  revised=appendQcRound(revised,sealQcRound(revised,'pass','SYNTHETIC-RESERVED-QC-2'));revised.report_event_id='SYNTHETIC-RESERVED-B';
  assert.equal((await deliver(s,revised)).version,'2.0');
  await rejectsCode(()=>deliver(s,original),'QC_HISTORY_RESET');
  assert.equal((await files(lineageDir(original))).length,2);
});

test('published reservation survives input-write ENOSPC: unrelated gets 2.0 and retry keeps 1.0 without duplication',async()=>{
  const s=await setup();let injected=false;const original=fs.open;
  const patched=mock.method(fs,'open',async(path,...args)=>{
    if(!injected && dirname(String(path))===join(s.store,'jobs',jobId(s.input)) && basename(String(path)).startsWith('.write-')) {
      injected=true;const e=new Error('Synthetic ENOSPC at input initialization');e.code='ENOSPC';throw e;
    }
    return original(path,...args);
  });syncBuiltinESMExports();
  try {await rejectsCode(()=>deliver(s),'ENOSPC');}finally{patched.mock.restore();syncBuiltinESMExports();}
  assert.equal(injected,true);
  const journal=join(s.store,'jobs',jobId(s.input),'journal.json');
  const reserved=JSON.parse(await fs.readFile(journal,'utf8'));assert.equal(reserved.status,'reserved');assert.equal(reserved.version,'1.0');
  const other=structuredClone(s.input);other.report_event_id='SYNTHETIC-AFTER-RESERVATION';
  const b=await deliver(s,other),a=await deliver(s),again=await deliver(s);
  assert.equal(b.version,'2.0');assert.equal(a.version,'1.0');assert.equal(again.report,a.report);
  assert.equal((await files(join(s.store,'reports'))).filter(f=>f.path.endsWith('.xlsx')).length,2);
});

async function legacyOrphan(s,{artifact=false}={}) {
  const path=join(s.store,'jobs',jobId(s.input));await fs.mkdir(path,{recursive:true});
  await fs.writeFile(join(path,'input.json'),JSON.stringify(s.input,null,2)+'\n');
  await fs.writeFile(join(path,'gate.json'),JSON.stringify(await gateFindings(s.input,s.sources),null,2)+'\n');
  await fs.writeFile(join(path,'.write-deadbeef.tmp'),'Synthetic interrupted pre-fix journal attempt\n');
  if(artifact) await fs.writeFile(join(path,'prepared.xlsx'),'Synthetic artifact evidence must not be hidden');
  return path;
}

test('legacy pre-journal orphan is retained byte-for-byte; unrelated and retry get unique versions',async()=>{
  const s=await setup(),path=await legacyOrphan(s),before=await files(path);
  const other=structuredClone(s.input);other.report_event_id='SYNTHETIC-LEGACY-UNRELATED';
  const b=await deliver(s,other),a=await deliver(s),again=await deliver(s);
  assert.equal(b.version,'1.0');assert.equal(a.version,'2.0');assert.equal(again.report,a.report);
  const retained=join(s.store,'incomplete-initializations'),names=await fs.readdir(retained);
  const archive=join(retained,names.find(n=>n.startsWith('legacy-'+jobId(s.input))));
  for(const f of before) assert.equal(sha256(await fs.readFile(join(archive,basename(f.path)))),f.sha256);
  assert.equal((await files(join(s.store,'reports'))).filter(f=>f.path.endsWith('.xlsx')).length,2);
});

test('missing journal with artifact evidence is rejected rather than silently hidden or replaced',async()=>{
  const s=await setup(),path=await legacyOrphan(s,{artifact:true}),before=await files(path);
  await rejectsCode(()=>deliver(s),'INCOMPLETE_JOB_HAS_UNEXPECTED_EVIDENCE');
  assert.deepEqual(await files(path),before);
});
