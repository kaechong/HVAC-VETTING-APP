import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {unzipSync, strFromU8} from 'fflate';
import {makeFixture, signSyntheticQc} from './fixture.mjs';
import {appendQcRound, validateInput, gateFindings, snapshotDigest, findingDigest, inputManifestDigest} from '../lib/contract.mjs';
import {deliverOffline} from '../lib/delivery.mjs';
import {digest, sha256} from '../lib/common.mjs';

const out = new URL('../test-output/', import.meta.url).pathname;
await mkdir(out, {recursive:true});
async function setup(options={count:1}) {
  const dir=await mkdtemp(join(out,'revision-')), sources=join(dir,'sources'), store=join(dir,'store');
  const input=await makeFixture(sources,options);
  return {dir,sources,store,input};
}
function roundFor(input,result,number=input.qc.rounds.length+1) {
  const {owner_id,review_id,project,snapshot,findings,evidence,rules,coverage}=input;
  const q={round:number,context_id:'REVISION-QC-'+number,snapshot:structuredClone({owner_id,review_id,project,snapshot,findings,evidence,rules,coverage}),
    snapshot_sha256:snapshotDigest(input),previous_receipt_sha256:input.qc.rounds.at(-1)?.receipt_sha256??'0'.repeat(64),
    decisions:findings.map(f=>({finding_id:f.finding_id,finding_sha256:findingDigest(f),result,reason:'Synthetic revision regression'}))};
  return {...q,receipt_sha256:digest(q)};
}
const rejectsCode=(run,code)=>assert.rejects(run,e=>e.code===code);

test('regression: fail -> actually change Finding -> second round pass retains first snapshot',async()=>{
  const s=await setup();signSyntheticQc(s.input,['fail']);
  const first=structuredClone(s.input.qc.rounds[0]);
  s.input.findings[0].description='合成問題已實際修正，保留首輪歷史；';
  assert.doesNotThrow(()=>validateInput(s.input));
  const stale=await gateFindings(s.input,s.sources);assert.equal(stale.accepted.length,0);
  const next=appendQcRound(s.input,roundFor(s.input,'pass'));
  assert.deepEqual(next.qc.rounds[0],first);assert.notEqual(next.qc.rounds[0].snapshot_sha256,next.qc.rounds[1].snapshot_sha256);
  const gate=await gateFindings(next,s.sources);assert.equal(gate.accepted.length,1);assert.equal(gate.qc.rounds_used,2);
});

test('regression: actual source revision invalidates pass and can be QCed again without rewriting history',async()=>{
  const s=await setup();const {syncQcHistory}=await import('../lib/qc-ledger.mjs');await syncQcHistory(s.input);const first=structuredClone(s.input.qc.rounds[0]);
  const bytes=Buffer.from('[page:1]\n'+s.input.evidence[0].excerpt+'\nSYNTHETIC revision 2\n');
  await writeFile(join(s.sources,'SYNTHETIC-source.txt'),bytes);
  s.input.evidence[0].sha256=sha256(bytes);s.input.evidence[0].revision='SYNTHETIC-R2';s.input.snapshot.input_sha256=inputManifestDigest(s.input.evidence);
  assert.doesNotThrow(()=>validateInput(s.input));assert.equal((await gateFindings(s.input,s.sources)).accepted.length,0);
  const {recordQcRound}=await import('../lib/qc-ledger.mjs');const next=await recordQcRound({input:s.input,round:roundFor(s.input,'pass')});
  assert.deepEqual(next.qc.rounds[0],first);assert.equal((await gateFindings(next,s.sources)).accepted.length,1);
});

test('regression: historical decision reason tampering is rejected even if current Finding did not change',async()=>{
  const s=await setup();s.input.qc.rounds[0].decisions[0].reason='tampered history';
  assert.throws(()=>validateInput(s.input),e=>e.code==='QC_RECEIPT_TAMPERED');
});

test('regression: persistent lineage rejects fourth round, cleared history and rehashed reset attempts',async()=>{
  const s=await setup();s.input.qc.rounds=[];
  const {recordQcRound}=await import('../lib/qc-ledger.mjs');
  const ledgerRoot=join(s.dir,'qc-ledger');let input=s.input;
  for(let i=1;i<=3;i++){
    input.findings[0].description='第'+i+'輪真正不同的合成修訂；';
    input=await recordQcRound({input,round:roundFor(input,'fail'),ledgerRoot});
  }
  await rejectsCode(()=>recordQcRound({input,round:roundFor(input,'pass'),ledgerRoot}),'QC_THREE_ROUND_LIMIT');
  const cleared=structuredClone(input);cleared.qc.rounds=[];
  await rejectsCode(()=>recordQcRound({input:cleared,round:roundFor(cleared,'pass'),ledgerRoot}),'QC_HISTORY_RESET');
  const reset=structuredClone(input);reset.qc.rounds=[roundFor({...input,qc:{rounds:[]}},'pass',1)];
  await rejectsCode(()=>recordQcRound({input:reset,round:roundFor(reset,'pass'),ledgerRoot}),'QC_HISTORY_RESET');
  const rewritten=structuredClone(input);rewritten.qc.rounds[0].decisions[0].reason='rehash attempt';
  rewritten.qc.rounds.forEach((q,i)=>{q.previous_receipt_sha256=i?rewritten.qc.rounds[i-1].receipt_sha256:'0'.repeat(64);const {receipt_sha256,...body}=q;q.receipt_sha256=digest(body);});
  await rejectsCode(()=>recordQcRound({input:rewritten,round:roundFor(rewritten,'pass'),ledgerRoot}),'QC_HISTORY_REWRITE');
});

test('regression: overlong UTF-8 filename rejects before reserving a report version',async()=>{
  const s=await setup({count:1,name:'中'.repeat(100)});
  await rejectsCode(()=>deliverOffline({input:s.input,sourceRoot:s.sources,storeRoot:s.store}),'REPORT_FILENAME_TOO_LONG');
  let entries=[];try{entries=await readdir(join(s.store,'jobs'));}catch(e){if(e.code!=='ENOENT')throw e;}
  assert.equal(entries.length,0);
});

test('regression: 18 Findings remain visible through openpyxl read_only including rows 21-23',async()=>{
  const s=await setup({count:18}),result=await deliverOffline({input:s.input,sourceRoot:s.sources,storeRoot:s.store});
  const xml=strFromU8(unzipSync(new Uint8Array(await readFile(result.report)))['xl/worksheets/sheet2.xml']);
  const dimension=xml.match(/<dimension\b[^>]*\bref="([^"]+)"/)?.[1]??null;
  const data=JSON.parse(execFileSync('python',['-B','-c',
    'import openpyxl,json,sys;w=openpyxl.load_workbook(sys.argv[1],read_only=True);s=w["工作表1"];rows=list(s.iter_rows(values_only=True));print(json.dumps({"rows":len(rows),"last_numbers":[r[0] for r in rows[20:23]],"all_findings":len([r for r in rows[5:] if len(r)>2 and r[2]])}))',result.report],{encoding:'utf8'}));
  assert.deepEqual(data,{rows:23,last_numbers:[16,17,18],all_findings:18});
  assert.ok(dimension===null||dimension==='A1:D23','No stale dimension may truncate streamed reading');
});

test('persistent revision: real Finding correction retains two rounds and rejects clearing history in another store',async()=>{
  const s=await setup(),{recordQcRound}=await import('../lib/qc-ledger.mjs');s.input.qc.rounds=[];
  let input=await recordQcRound({input:s.input,round:roundFor(s.input,'fail')});
  input.findings[0].description='真正修正後的合成 Finding；';
  input=await recordQcRound({input,round:roundFor(input,'pass')});
  const delivered=await deliverOffline({input,sourceRoot:s.sources,storeRoot:s.store});assert.equal(delivered.accepted,1);assert.equal(delivered.qc.rounds_used,2);
  const reset=structuredClone(input);reset.qc.rounds=[];
  await rejectsCode(()=>deliverOffline({input:reset,sourceRoot:s.sources,storeRoot:join(s.dir,'different-store')}),'QC_HISTORY_RESET');
});

test('persistent receipt: modifying saved historical bytes is detected',async()=>{
  const s=await setup(),{recordQcRound}=await import('../lib/qc-ledger.mjs');s.input.qc.rounds=[];
  const ledgerRoot=join(s.dir,'qc-ledger'),input=await recordQcRound({input:s.input,round:roundFor(s.input,'fail'),ledgerRoot});
  const lineage=(await readdir(ledgerRoot))[0],dir=join(ledgerRoot,lineage),file=(await readdir(dir))[0],path=join(dir,file);
  const q=JSON.parse(await readFile(path,'utf8'));q.decisions[0].reason='disk tamper';await writeFile(path,JSON.stringify(q));
  await rejectsCode(()=>recordQcRound({input,round:roundFor(input,'pass'),ledgerRoot}),'QC_RECEIPT_TAMPERED');
});

test('filename boundary: full 255-byte name publishes without truncating project name; 256 bytes rejects',async()=>{
  const s=await setup({name:'中'.repeat(78)+'AB'}),delivered=await deliverOffline({input:s.input,sourceRoot:s.sources,storeRoot:s.store});
  const filename=delivered.report.split('/').at(-1);assert.equal(Buffer.byteLength(filename),255);
  const {default:ExcelJS}=await import('exceljs');const w=new ExcelJS.Workbook();await w.xlsx.load(await readFile(delivered.report));assert.equal(w.getWorksheet('工作表1').getCell('A1').value,s.input.project.name);
  const over=await setup({name:'中'.repeat(78)+'ABC'});await rejectsCode(()=>deliverOffline({input:over.input,sourceRoot:over.sources,storeRoot:over.store}),'REPORT_FILENAME_TOO_LONG');
});
