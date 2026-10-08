import {mkdir, writeFile, readFile, copyFile, lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {makeFixture, signSyntheticQc} from '../test/fixture.mjs';
import {main} from '../cli.mjs';
import {sealQcRound} from '../lib/contract.mjs';
import {recordQcRound} from '../lib/qc-ledger.mjs';

const root = new URL('../../../samples/final-r2/', import.meta.url).pathname;
await mkdir(root, {recursive: true});
const cases = [
  {id:'normal', options:{count:2,name:'SYNTHETIC_正常四欄'}},
  {id:'zero', options:{count:0,name:'SYNTHETIC_零問題不代表符合'}},
  {id:'long-18', options:{count:18,long:true,name:'SYNTHETIC_長中文十八行'}},
  {id:'unknown-source', options:{count:2,name:'SYNTHETIC_未知來源隔離'}},
  {id:'malicious-text', options:{count:2,drawing:true,name:'SYNTHETIC_惡意字串文字化'}},
  {id:'qc-three-stop', options:{count:1,name:'SYNTHETIC_QC三輪停止'}},
  {id:'qc-real-revision', options:{count:1,name:'SYNTHETIC_QC實際修正'}},
  {id:'recovery', options:{count:2,name:'SYNTHETIC_中斷恢復'}}
];
const manifest = [];
for (const c of cases) {
  const dir=join(root,c.id), sources=join(dir,'sources'), store=join(dir,'store'), inputPath=join(dir,'input.json');
  await mkdir(dir,{recursive:true}); const input=await makeFixture(sources,c.options);
  if(c.id==='unknown-source'){input.findings[0].evidence_ids=['MISSING-EVIDENCE'];input.findings[0].primary_evidence_id='MISSING-EVIDENCE';signSyntheticQc(input);}
  if(c.id==='malicious-text'){input.evidence[0].drawing_id='=1+1';input.findings[0].description='=HYPERLINK("https://attacker.invalid","合成惡意文字")；';input.findings[1].description='</c><f>SUM(1,2)</f><c>\n@SUM(A1:A2)；';signSyntheticQc(input);}
  if(c.id==='qc-three-stop')signSyntheticQc(input,['fail','fail','fail']);
  if(c.id==='qc-real-revision'){try{Object.assign(input,JSON.parse(await readFile(inputPath,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;input.qc.rounds=[];let revised=await recordQcRound({input,round:sealQcRound(input,'fail','SYNTHETIC-QC-1')});revised.findings[0].description='真正修正後的離線合成內容；';revised=await recordQcRound({input:revised,round:sealQcRound(revised,'pass','SYNTHETIC-QC-2')});Object.assign(input,revised);}}
  await writeFile(inputPath,JSON.stringify(input,null,2)+'\n');
  const args=['--input',inputPath,'--sources',sources,'--store',store];
  if(c.id==='recovery'){
    try{await lstat(join(dir,'interruption.json'));}
    catch(e){if(e.code!=='ENOENT')throw e;try{await main([...args,'--simulate-interruption','after-prepared']);throw new Error('Expected interruption');}catch(error){if(error.code!=='SIMULATED_INTERRUPTION')throw error;await writeFile(join(dir,'interruption.json'),JSON.stringify({expected:'SIMULATED_INTERRUPTION',actual:error.code,checkpoint:error.message},null,2)+'\n');}}
  }
  const delivered=await main(args), repeated=await main(args);
  if(delivered.report_sha256!==repeated.report_sha256||delivered.version!==repeated.version)throw new Error('Idempotency failed for '+c.id);
  await copyFile(delivered.report,join(dir,'report-v1.0.xlsx'));
  await copyFile(delivered.receipt,join(dir,'receipt-v1.0.json'));
  const row={case:c.id,input:inputPath,sources,cli:['node','cli.mjs',...args],report:join(dir,'report-v1.0.xlsx'),receipt:join(dir,'receipt-v1.0.json'),...delivered};
  // report field is the authoritative local delivery; convenience copies have the same bytes.
  if(c.id==='normal'){
    input.report_event_id='SYNTHETIC-EXPORT-2';const reissuePath=join(dir,'reissue-input.json');await writeFile(reissuePath,JSON.stringify(input,null,2)+'\n');
    const next=await main(['--input',reissuePath,'--sources',sources,'--store',store]);
    await copyFile(next.report,join(dir,'report-v2.0.xlsx'));await copyFile(next.receipt,join(dir,'receipt-v2.0.json'));row.reissue=next;
  }
  manifest.push(row);console.log(JSON.stringify({case:c.id,...delivered}));
}
await writeFile(join(root,'SAMPLE_MANIFEST.json'),JSON.stringify({kind:'synthetic-offline-provisional',engineering_acceptance:'NOT_RUN',samples:manifest},null,2)+'\n');
