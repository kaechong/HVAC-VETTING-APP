import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join, dirname, basename} from 'node:path';
import {makeFixture} from './fixture.mjs';
import {appendQcRound, sealQcRound} from '../lib/contract.mjs';
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
  let revised=structuredClone(original);
  revised.findings[0].description='Actually revised synthetic Finding after delivery A；';
  revised=appendQcRound(revised,sealQcRound(revised,'pass','SYNTHETIC-REPLAY-QC-2'));
  revised.report_event_id='SYNTHETIC-EXPORT-B';
  const b=await deliver(s,revised);
  assert.equal(b.version,'2.0');
  let replay;
  try {replay=await deliver(s,original);} catch(e) {console.log('REPRO historical replay:',e.code,'fixture:',s.dir);throw e;}
  assert.equal(replay.report,a.report);assert.equal(replay.version,'1.0');assert.equal(replay.report_sha256,a.report_sha256);
  assert.equal((await fs.readdir(join(s.store,'jobs'))).length,2);
  const active=JSON.parse(await fs.readFile(join(s.store,'active-index.json'),'utf8'));
  assert.equal(Object.values(active.active)[0].version,'2.0');
  assert.equal(sha256(await fs.readFile(a.receipt)),sha256(await fs.readFile(replay.receipt)));
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
