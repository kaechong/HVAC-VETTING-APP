import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, readdir, symlink} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import ExcelJS from 'exceljs';
import {unzipSync, strFromU8} from 'fflate';
import {makeFixture, signSyntheticQc} from './fixture.mjs';
import {validateInput, gateFindings, snapshotDigest, findingDigest, appendQcRound, sealQcRound} from '../lib/contract.mjs';
import {deliverOffline, DEFAULT_TEMPLATE} from '../lib/delivery.mjs';
import {renderMother} from '../lib/mother-renderer.mjs';
import {HEADERS, sha256, digest} from '../lib/common.mjs';

globalThis.fetch = async () => { throw new Error('Network is forbidden in offline tests'); };
const output = new URL('../test-output/', import.meta.url);
await mkdir(output, {recursive: true});
async function setup(options) {
  const dir = await mkdtemp(join(output.pathname, 'case-'));
  const sources = join(dir, 'sources'), store = join(dir, 'store');
  const input = await makeFixture(sources, options);
  const deliver = () => deliverOffline({input, sourceRoot: sources, storeRoot: store});
  return {dir, sources, store, input, deliver};
}
async function workbook(path) { const w = new ExcelJS.Workbook(); await w.xlsx.load(await readFile(path)); return w; }
const rejectsCode = (work, code) => assert.rejects(work, e => e.code === code);

test('normal: exact four columns, two mother sheets, literal Finding text, receipt and readback hash', async () => {
  const s = await setup(), delivered = await s.deliver(), bytes = await readFile(delivered.report), w = await workbook(delivered.report);
  assert.equal(delivered.accepted, 2); assert.equal(w.worksheets.length, 2);
  const r = w.getWorksheet('工作表1');
  assert.deepEqual(HEADERS.map((_,i) => r.getCell(5,i+1).value), HEADERS);
  assert.equal(r.getCell('A6').value, 1); assert.equal(r.getCell('A6').numFmt, '0.0');
  assert.equal(r.getCell('B6').value, 'SYNTHETIC-source.txt p.1');
  assert.equal(r.getCell('C6').value, s.input.findings[0].description); assert.equal(r.getCell('D6').value, s.input.findings[0].code_citation);
  assert.equal(r.getCell('A1').value, s.input.project.name); assert.equal(r.getCell('A2').value, '2026-10-07'); assert.equal(r.getCell('A3').value, '1.0');
  assert.equal(r.getColumn(2).width, 22.75); assert.equal(r.getColumn(3).width, 46.88); assert.equal(r.getColumn(4).width, 55.38);
  assert.deepEqual(r.model.merges, ['A1:D1','A2:D2','A3:D3']);
  const receipt = JSON.parse(await readFile(delivered.receipt));
  assert.equal(sha256(bytes), delivered.report_sha256); assert.equal(receipt.report_sha256, sha256(bytes));
  assert.equal(receipt.drive_receipt, null); assert.equal(receipt.engineering_acceptance, 'NOT_RUN'); assert.equal(receipt.model_requests, 0);
  assert.equal(receipt.product_score, 'NOT_ASSESSED'); assert.equal(receipt.provisional.formal_acceptance, false);
});

test('preservation: all OOXML parts except report cells/styles/unused sample strings are byte-identical', async () => {
  const s = await setup(), result = await s.deliver();
  const a = unzipSync(new Uint8Array(await readFile(DEFAULT_TEMPLATE))), b = unzipSync(new Uint8Array(await readFile(result.report)));
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
  for (const p of Object.keys(a)) if (!['xl/worksheets/sheet2.xml','xl/styles.xml','xl/sharedStrings.xml'].includes(p)) assert.equal(sha256(b[p]), sha256(a[p]), p);
  assert.ok(!strFromU8(b['xl/sharedStrings.xml']).includes('XXXXX'));
  const report = strFromU8(b['xl/worksheets/sheet2.xml']);
  assert.ok(!report.includes('沒有提交通風系統風量計算書')); assert.ok(!report.includes('<f>'));
  assert.ok(report.includes('<drawing r:id="rId1"/>')); assert.ok(report.includes('defaultColWidth="12.63"'));
});

test('zero issues: no sample Finding; numbered reservation and all unreviewed coverage remain explicit', async () => {
  const s = await setup({count: 0}), result = await s.deliver(), w = await workbook(result.report), sheet = w.getWorksheet('工作表1');
  assert.equal(result.accepted, 0); assert.equal(sheet.rowCount, 20);
  for (let r = 6; r <= 20; r++) { assert.equal(sheet.getCell(r,1).value, r-5); for (let c=2;c<=4;c++) { const cell=sheet.getCell(r,c);assert.equal(cell.value, null); assert.equal(cell.alignment.horizontal,'center');for(const edge of ['left','right','top','bottom'])assert.equal(cell.border[edge].style,'thin'); } }
  const receipt = JSON.parse(await readFile(result.receipt)); assert.equal(receipt.coverage.length, 24);
  assert.ok(receipt.coverage.every(c => c.state === 'not_reviewed')); assert.ok(receipt.limitations.includes('ZERO_FINDINGS_IS_NOT_COMPLIANCE'));
});

test('long Chinese and more than 15: one Finding per row, wrap, bounded height, no content truncation', async () => {
  const s = await setup({count: 18, long: true}), result = await s.deliver(), w = await workbook(result.report), r = w.getWorksheet('工作表1');
  assert.equal(result.accepted, 18); assert.equal(r.rowCount, 23);
  for (let i=0;i<18;i++) {
    assert.equal(r.getCell(i+6,1).value, i+1); assert.equal(r.getCell(i+6,3).value, s.input.findings[i].description);
    assert.equal(r.getCell(i+6,3).alignment.wrapText, true); assert.ok(r.getRow(i+6).height > 15.75 && r.getRow(i+6).height <= 409.5);
    for (let c=1;c<=4;c++) { const cell=r.getCell(i+6,c); assert.equal(cell.font.name,'Arial'); assert.equal(cell.fill.pattern,'none'); for (const edge of ['left','right','top','bottom']) assert.equal(cell.border[edge].style,'thin'); }
  }
});

test('drawing label uses drawing ID instead of file name', async () => {
  const s = await setup({count: 1, drawing: true}), result = await s.deliver();
  assert.equal((await workbook(result.report)).getWorksheet('工作表1').getCell('B6').value, 'SYNTHETIC-M-101');
});

test('unknown source is quarantined even when synthetic QC says pass', async () => {
  const s = await setup(); s.input.findings[0].evidence_ids=['UNKNOWN']; s.input.findings[0].primary_evidence_id='UNKNOWN'; signSyntheticQc(s.input);
  const result = await s.deliver(); assert.equal(result.accepted,1); assert.equal(result.quarantined[0].finding_id,'SYNTHETIC-F-1');
  assert.ok(result.quarantined[0].reasons.includes('UNKNOWN_SOURCE:UNKNOWN'));
  assert.equal((await workbook(result.report)).getWorksheet('工作表1').getCell('C6').value,s.input.findings[1].description);
});

test('unknown / pending / wrong-system rules, advice and scope mismatch cannot enter violation column', async () => {
  for (const variant of ['unknown','pending','wrong-system','advice','scope']) {
    const s = await setup({count:1});
    if (variant==='unknown') s.input.findings[0].rule_id='MISSING-RULE';
    if (variant==='pending') s.input.rules[0].status='pending';
    if (variant==='wrong-system') s.input.rules[0].jurisdiction='IBC_NFPA';
    if (variant==='advice') s.input.findings[0].classification='advice';
    if (variant==='scope') s.input.rules[0].trigger='DIFFERENT-MODE';
    signSyntheticQc(s.input); const gate=await gateFindings(s.input,s.sources); assert.equal(gate.accepted.length,0,variant); assert.equal(gate.quarantined.length,1,variant);
  }
});

test('source byte change, wrong page and invented excerpt are rejected', async () => {
  for (const variant of ['hash','page','excerpt']) {
    const s=await setup({count:1});
    if (variant==='hash') await writeFile(join(s.sources,'SYNTHETIC-source.txt'),'Changed source');
    if (variant==='page') { s.input.evidence[0].page=2; signSyntheticQc(s.input); }
    if (variant==='excerpt') { s.input.evidence[0].excerpt='Not in original'; signSyntheticQc(s.input); }
    assert.equal((await gateFindings(s.input,s.sources)).accepted.length,0,variant);
  }
});

test('formula injection and malicious cell strings stay exact literal strings, no formulas/hyperlinks', async () => {
  const strings=['=HYPERLINK("https://attacker.invalid","click")；','+SUM(1,2)；','-1+2；','@SUM(A1:A2)；','</c><f>CMD()</f><c>；','_x000D_ & <xml> "引號"\n中文；'];
  const s=await setup({count:strings.length,drawing:true}); s.input.evidence[0].drawing_id='=1+1';
  strings.forEach((v,i)=>{s.input.findings[i].description=v;}); signSyntheticQc(s.input);
  const result=await s.deliver(), r=(await workbook(result.report)).getWorksheet('工作表1');
  assert.equal(r.getCell('B6').value,'=1+1');
  for (let i=0;i<strings.length;i++) { const cell=r.getCell(i+6,3); assert.equal(cell.value,strings[i]); assert.equal(cell.type,ExcelJS.ValueType.String); assert.equal(cell.formula,undefined); assert.equal(cell.hyperlink,undefined); }
  const z=unzipSync(new Uint8Array(await readFile(result.report))); assert.ok(!strFromU8(z['xl/worksheets/sheet2.xml']).includes('<f>'));
});

test('duplicate Finding IDs and unsupported controls reject the input before report allocation', async () => {
  const s=await setup(); s.input.findings[1].finding_id=s.input.findings[0].finding_id;
  await rejectsCode(s.deliver,'DUPLICATE_FINDING_ID');
  s.input.findings[1].finding_id='RESTORED-ID';s.input.findings[0].description='bad\u0000；'; signSyntheticQc(s.input);
  await rejectsCode(s.deliver,'INVALID_CELL_TEXT');
});

test('QC is isolated, stale decisions fail, exactly three rounds stop and a fourth is forbidden', async () => {
  const s=await setup({count:1}); signSyntheticQc(s.input,['fail','fail','fail']);
  const gate=await gateFindings(s.input,s.sources);assert.equal(gate.qc.rounds_used,3);assert.equal(gate.qc.state,'stopped_after_three'); assert.equal(gate.accepted.length,0);
  const fourth={...s.input.qc.rounds[2],round:4,context_id:'SYNTHETIC-QC-4'};
  assert.throws(()=>appendQcRound(s.input,fourth),e=>e.code==='QC_THREE_ROUND_LIMIT');
  const invalid=structuredClone(s.input);invalid.qc.rounds.push(fourth);assert.throws(()=>validateInput(invalid),e=>e.code==='QC_THREE_ROUND_LIMIT');
  signSyntheticQc(s.input);s.input.qc.rounds[0].context_id=s.input.snapshot.main_context_id;{const {receipt_sha256,...body}=s.input.qc.rounds[0];s.input.qc.rounds[0].receipt_sha256=digest(body);}assert.throws(()=>validateInput(s.input),e=>e.code==='QC_CONTEXT_NOT_ISOLATED');
  signSyntheticQc(s.input);s.input.findings[0].description='changed after QC；';assert.doesNotThrow(()=>validateInput(s.input));assert.equal((await gateFindings(s.input,s.sources)).accepted.length,0);
});

test('QC not run / unresolved before third round blocks delivery; pass after failed round can proceed', async () => {
  const s=await setup({count:1});s.input.qc.rounds=[];await rejectsCode(s.deliver,'QC_NOT_READY');
  signSyntheticQc(s.input,['fail']);await rejectsCode(s.deliver,'QC_NOT_READY');
  const round=sealQcRound(s.input,'pass','SYNTHETIC-QC-2');
  s.input=appendQcRound(s.input,round);const result=await deliverOffline({input:s.input,sourceRoot:s.sources,storeRoot:s.store});assert.equal(result.accepted,1);assert.equal(result.qc.rounds_used,2);
});

test('same event is idempotent; explicit reissue on same snapshot gets next version and retains history', async () => {
  const s=await setup(), first=await s.deliver(), repeated=await s.deliver();
  assert.equal(repeated.report,first.report);assert.equal(repeated.version,'1.0');assert.equal(repeated.report_sha256,first.report_sha256);
  s.input.report_event_id='SYNTHETIC-REISSUE';const second=await s.deliver();assert.equal(second.version,'2.0');
  assert.equal(sha256(await readFile(first.report)),first.report_sha256);
  s.input.report_event_id='SYNTHETIC-EXPORT-1';await s.deliver();
  const index=JSON.parse(await readFile(join(s.store,'active-index.json')));assert.equal(Object.values(index.active)[0].version,'2.0');
});

test('same report event with changed payload rejects, preserving prior report and version', async () => {
  const s=await setup(), first=await s.deliver(); s.input.findings[0].description='new payload；';signSyntheticQc(s.input);
  await rejectsCode(s.deliver,'REPORT_EVENT_CONFLICT');assert.equal(sha256(await readFile(first.report)),first.report_sha256);
  assert.equal((await readdir(join(s.store,'jobs'))).length,1);
});

test('interruption at four persisted checkpoints resumes same version and prepared report hash', async () => {
  for (const failAt of ['after-reserved','after-prepared','after-copy','after-receipt']) {
    const s=await setup();await rejectsCode(()=>deliverOffline({input:s.input,sourceRoot:s.sources,storeRoot:s.store,failAt}),'SIMULATED_INTERRUPTION');
    const jobDir=join(s.store,'jobs',(await readdir(join(s.store,'jobs')))[0]);const prior=JSON.parse(await readFile(join(jobDir,'journal.json')));
    const result=await s.deliver();assert.equal(result.version,'1.0',failAt);if(prior.artifact)assert.equal(result.report_sha256,prior.artifact.sha256,failAt);
    assert.equal((await readdir(join(s.store,'jobs'))).length,1,failAt);
  }
});

test('tampered delivered report never receives a successful readback receipt or replacement', async () => {
  const s=await setup(), result=await s.deliver();await writeFile(result.report,'tampered');
  await rejectsCode(s.deliver,'IMMUTABLE_ARTIFACT_CONFLICT');assert.equal((await readFile(result.report)).toString(),'tampered');
});

test('modified receipt is detected; missing effective index can be rebuilt from verified completed jobs', async () => {
  const s=await setup(), result=await s.deliver();
  await writeFile(join(s.store,'active-index.json'),'not an authoritative index');
  await s.deliver();assert.equal(Object.values(JSON.parse(await readFile(join(s.store,'active-index.json'))).active)[0].sha256,result.report_sha256);
  await writeFile(result.receipt,'{}');await rejectsCode(s.deliver,'IMMUTABLE_ARTIFACT_CONFLICT');
});

test('local serialization prevents duplicate concurrent allocation, without promising remote billing guarantees', async () => {
  const s=await setup(), results=await Promise.allSettled([s.deliver(),s.deliver()]);
  assert.ok(results.some(r=>r.status==='fulfilled'));for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'STORE_BUSY');
  const final=await s.deliver();assert.equal(final.version,'1.0');assert.equal((await readdir(join(s.store,'jobs'))).length,1);
});

test('source traversal and symlink cannot read outside approved synthetic source directory', async () => {
  const s=await setup({count:1});s.input.evidence[0].relative_path='../secret.txt';signSyntheticQc(s.input);
  assert.throws(()=>validateInput(s.input),e=>e.code==='UNSAFE_SOURCE_PATH');
  s.input.evidence[0].relative_path='link.txt';await symlink(join(s.sources,'SYNTHETIC-source.txt'),join(s.sources,'link.txt'));signSyntheticQc(s.input);
  const gate=await gateFindings(s.input,s.sources);assert.ok(gate.quarantined[0].reasons.includes('SOURCE_SYMLINK:E-1'));
});

test('wrong template hash and excessive wrapped height stop instead of changing template or silently clipping', async () => {
  const s=await setup({count:1}), gate=await gateFindings(s.input,s.sources), templateBytes=await readFile(DEFAULT_TEMPLATE);
  await rejectsCode(()=>renderMother({templateBytes:Buffer.from('wrong'),project:s.input.project,version:'1.0',accepted:gate.accepted}),'MOTHER_HASH_MISMATCH');
  gate.accepted[0].problem='長'.repeat(7900)+'；';await rejectsCode(()=>renderMother({templateBytes,project:s.input.project,version:'1.0',accepted:gate.accepted}),'ROW_HEIGHT_LIMIT');
});
