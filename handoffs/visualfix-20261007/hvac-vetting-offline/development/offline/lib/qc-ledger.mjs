import {mkdir, readdir, readFile, lstat, open, link, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest, ensure, OfflineError} from './common.mjs';
import {validateInput, appendQcRound} from './contract.mjs';

// Independent of the chosen delivery store: changing --store cannot reset QC.
export const DEFAULT_QC_ROOT = new URL('../state/qc-lineages/', import.meta.url).pathname;
async function folder(path) {
  await mkdir(path,{recursive:true}); const s=await lstat(path);
  ensure(s.isDirectory() && !s.isSymbolicLink(),'UNSAFE_QC_LEDGER');
}
async function locked(input, ledgerRoot, operation) {
  const root=resolve(ledgerRoot), key=digest({owner_id:input.owner_id,project_id:input.project.id,review_id:input.review_id});
  await folder(root); const dir=join(root,key); await folder(dir);
  const lockPath=join(dir,'.lock'); let lock;
  try {lock=await open(lockPath,'wx');} catch(e) {if(e.code==='EEXIST')throw new OfflineError('QC_LEDGER_BUSY');throw e;}
  try {
    await lock.writeFile(JSON.stringify({pid:process.pid,lineage:key}));await lock.sync();
    const names=(await readdir(dir)).filter(n=>n!=='.lock');
    ensure(names.every(n=>/^round-[1-3]-[a-f0-9]{64}\.json$/.test(n)), 'QC_LEDGER_UNEXPECTED_ENTRY');
    names.sort();const stored=[];
    for(const name of names) {
      const path=join(dir,name),s=await lstat(path);
      ensure(s.isFile()&&!s.isSymbolicLink()&&s.size<=8388608,'UNSAFE_QC_LEDGER');
      let q;try {q=JSON.parse(await readFile(path,'utf8'));} catch {throw new OfflineError('QC_LEDGER_CORRUPT');}
      ensure(name===`round-${stored.length+1}-${q.receipt_sha256}.json`,'QC_LEDGER_CORRUPT');stored.push(q);
    }
    validateInput({...input,qc:{rounds:stored}});
    ensure(input.qc.rounds.length>=stored.length,'QC_HISTORY_RESET');
    stored.forEach((q,i)=>ensure(digest(q)===digest(input.qc.rounds[i]),'QC_HISTORY_REWRITE'));
    validateInput(input);
    async function save(q) {
      const temp=join(dir,'.write-'+randomUUID()+'.tmp');const f=await open(temp,'wx');
      try {await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync();}finally{await f.close();}
      try {await link(temp,join(dir,`round-${q.round}-${q.receipt_sha256}.json`));}finally{await unlink(temp);}
      stored.push(q);
    }
    // Explicit synthetic history import is allowed once; persisted prefixes are authoritative thereafter.
    for(const q of input.qc.rounds.slice(stored.length))await save(q);
    return await operation(save);
  } finally {await lock.close();await unlink(lockPath);}
}
export async function syncQcHistory(input, ledgerRoot=DEFAULT_QC_ROOT) {
  return locked(input,ledgerRoot,async()=>input);
}
export async function recordQcRound({input,round,ledgerRoot=DEFAULT_QC_ROOT}) {
  return locked(input,ledgerRoot,async save=>{
    const next=appendQcRound(input,round);await save(next.qc.rounds.at(-1));return next;
  });
}
