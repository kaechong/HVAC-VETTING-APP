import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {join,basename} from 'node:path';
import {deliverOffline} from '../hvac-vetting-offline/development/offline/lib/delivery.mjs';
import {sha256} from '../hvac-vetting-offline/development/offline/lib/common.mjs';
const root=new URL('../',import.meta.url).pathname;
const original=join(root,'evidence/initial-failure-fixture');
const run=await fs.mkdtemp(join(root,'actual-orphan-recheck-'));
const replay=join(run,'case');
await fs.cp(original,replay,{recursive:true,errorOnExist:true,force:false});
const jobs=join(replay,'store/jobs'),name=(await fs.readdir(jobs))[0],orphan=join(jobs,name);
const before=[];
for(const name of await fs.readdir(orphan)){
 const bytes=await fs.readFile(join(orphan,name));before.push({name,bytes:bytes.length,sha256:sha256(bytes)});
}
const input=JSON.parse(await fs.readFile(join(orphan,'input.json'),'utf8'));
const sources=join(replay,'sources'),store=join(replay,'store');
const other=structuredClone(input);other.report_event_id='SYNTHETIC-ACTUAL-ORPHAN-OTHER';
const b=await deliverOffline({input:other,sourceRoot:sources,storeRoot:store});
const a=await deliverOffline({input,sourceRoot:sources,storeRoot:store});
const again=await deliverOffline({input,sourceRoot:sources,storeRoot:store});
assert.equal(b.version,'1.0');assert.equal(a.version,'2.0');assert.equal(a.report,again.report);
const retained=join(store,'incomplete-initializations');
const dir=join(retained,(await fs.readdir(retained)).find(n=>n.startsWith('legacy-')));
for(const f of before)assert.equal(sha256(await fs.readFile(join(dir,f.name))),f.sha256);
const result={scope:'Recovery from a copy of the actual before-fix ENOSPC orphan, not an emulated legacy layout',status:'PASS',original_reproduction_untouched:true,retained_evidence:before,unrelated_version:b.version,retry_version:a.version,replay_same_path:again.report===a.report,replay_same_hash:again.report_sha256===a.report_sha256,jobs:(await fs.readdir(jobs)).length,report_hashes:{unrelated:b.report_sha256,retry:a.report_sha256},retained_directory:dir};
await fs.writeFile(join(root,'evidence/ACTUAL_ORPHAN_RECOVERY_RECHECK.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
