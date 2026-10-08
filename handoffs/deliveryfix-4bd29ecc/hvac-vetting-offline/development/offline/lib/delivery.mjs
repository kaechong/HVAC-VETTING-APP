import {readFile, mkdir, readdir, lstat, open, rename, unlink, link} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensure, OfflineError, digest, sha256, TEMPLATE_SHA256} from './common.mjs';
import {gateFindings, validateInput} from './contract.mjs';
import {syncQcHistory, verifyHistoricalQcReplay} from './qc-ledger.mjs';
import {renderMother} from './mother-renderer.mjs';

export const DEFAULT_TEMPLATE = new URL('../../../baseline/plan/templates/HVAC_VETTING_CHECKLIST_MOTHER_20261007.xlsx', import.meta.url);
const absent = e => e.code === 'ENOENT';
async function regularRead(path) {
  const stat = await lstat(path); ensure(stat.isFile() && !stat.isSymbolicLink(), 'UNSAFE_STORE_FILE');
  ensure(stat.size <= 8388608, 'STORE_FILE_SIZE_LIMIT'); return readFile(path);
}
async function jsonRead(path) {
  try { return JSON.parse((await regularRead(path)).toString('utf8')); }
  catch (e) { if (e instanceof SyntaxError) throw new OfflineError('CORRUPT_STORE_JSON'); throw e; }
}
async function folder(path) {
  await mkdir(path, {recursive: true}); const stat = await lstat(path); ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_STORE_DIRECTORY');
}
async function atomicJson(path, value) {
  const temp = join(dirname(path), '.write-' + randomUUID() + '.tmp');
  const file = await open(temp, 'wx');
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
}
async function immutableBytes(path, bytes) {
  const temp = join(dirname(path), '.write-' + randomUUID() + '.tmp');
  const file = await open(temp, 'wx');
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  try {
    await link(temp, path); // atomic publish without replacing an existing artifact
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    ensure(sha256(await regularRead(path)) === sha256(bytes), 'IMMUTABLE_ARTIFACT_CONFLICT');
  } finally { await unlink(temp); }
}
const interrupt = (actual, expected) => { if (actual === expected) throw new OfflineError('SIMULATED_INTERRUPTION', expected); };
async function verifyArtifact(path, expected) {
  const bytes = await regularRead(path);
  ensure(bytes.length === expected.bytes && sha256(bytes) === expected.sha256, 'REPORT_HASH_MISMATCH'); return bytes;
}

async function refreshIndex(root, jobs) {
  const active = {};
  // Read back both artifact and receipt before publishing the effective local index.
  for (const job of jobs.filter(j => j.status === 'delivered')) {
    const key = digest({owner_id: job.owner_id, project_id: job.project_id});
    await verifyArtifact(join(root, job.delivered_path), job.artifact);
    const receipt = await jsonRead(join(root, 'jobs', job.job_id, 'receipt.json'));
    ensure(digest(receipt) === job.receipt_sha256 && receipt.report_sha256 === job.artifact.sha256 && receipt.version === job.version && receipt.review_id === job.review_id && receipt.report_event_id === job.report_event_id, 'RECEIPT_MISMATCH');
    if (!active[key] || Number.parseInt(active[key].version) < Number.parseInt(job.version)) active[key] = {project_id: job.project_id, owner_id: job.owner_id, review_id: job.review_id, report_event_id: job.report_event_id, version: job.version, path: job.delivered_path, sha256: job.artifact.sha256, receipt_sha256: job.receipt_sha256, kind: 'offline-provisional'};
  }
  await atomicJson(join(root, 'active-index.json'), {schema_version: '0.1', kind: 'offline-provisional', active});
}

async function loadJobs(root) {
  const jobs = [];
  for (const name of await readdir(join(root, 'jobs'))) {
    ensure(/^[a-f0-9]{64}$/.test(name), 'UNEXPECTED_STORE_ENTRY');
    const path = join(root, 'jobs', name); ensure((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink(), 'UNSAFE_STORE_DIRECTORY');
    let job;
    try { job = await jsonRead(join(path, 'journal.json')); }
    catch (e) {
      if (!absent(e)) throw e;
      // Recover pre-fix initialization debris only, never hide an artifact or receipt.
      const entries = await readdir(path);
      ensure(entries.every(n => ['input.json','gate.json'].includes(n) || /^\.write-[a-f0-9-]+\.tmp$/.test(n)), 'INCOMPLETE_JOB_HAS_UNEXPECTED_EVIDENCE');
      for (const entry of entries) await regularRead(join(path, entry));
      const retained = join(root, 'incomplete-initializations'); await folder(retained);
      await rename(path, join(retained, 'legacy-' + name + '-' + randomUUID()));
      continue; // No journal was published: no version was reserved.
    }
    ensure(job.job_id === name && ['reserved','prepared','delivered'].includes(job.status) && /^\d+\.0$/.test(job.version), 'CORRUPT_JOB');
    ensure(job.delivered_path === join('reports', digest({owner_id: job.owner_id, project_id: job.project_id}), job.version, job.filename), 'UNSAFE_STORE_PATH');
    ensure(!/[\/\\]/.test(job.filename), 'UNSAFE_STORE_PATH');
    jobs.push(job);
  }
  return jobs;
}

export function reportFilename(project, version) {
  const filename = project.name + '_' + project.review_date.replaceAll('-', '') + '_v' + version + '.xlsx';
  ensure(Buffer.byteLength(filename, 'utf8') <= 255, 'REPORT_FILENAME_TOO_LONG');
  return filename;
}

export async function deliverOffline({input, sourceRoot, storeRoot, failAt = null}) {
  validateInput(input);
  reportFilename(input.project, '1.0'); // Reject before any version reservation.
  ensure([null, 'after-reserved', 'after-prepared', 'after-copy', 'after-receipt'].includes(failAt), 'INVALID_FAILPOINT');
  const gate = await gateFindings(input, sourceRoot);
  const templateBytes = await readFile(DEFAULT_TEMPLATE);
  ensure(sha256(templateBytes) === TEMPLATE_SHA256, 'MOTHER_HASH_MISMATCH');
  const root = resolve(storeRoot); await folder(root); await folder(join(root, 'jobs')); await folder(join(root, 'reports'));
  const lockPath = join(root, '.delivery.lock'); let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (e) { if (e.code === 'EEXIST') throw new OfflineError('STORE_BUSY', 'Another local delivery may be active; do not automatically remove its lock.'); throw e; }
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, operation: 'offline-delivery'})); await lock.sync();
    const jobs = await loadJobs(root);
    const existing = jobs.find(j=>j.job_id===digest({owner_id:input.owner_id,project_id:input.project.id,report_event_id:input.report_event_id}));
    if(existing) {
      ensure(existing.payload_sha256===digest(input),'REPORT_EVENT_CONFLICT');
      ensure(existing.gate_sha256===digest(gate),'EVIDENCE_CHANGED_SINCE_PREPARATION');
    }
    if (existing?.status === 'delivered') {
      const saved = join(root, 'jobs', existing.job_id);
      ensure(digest(await jsonRead(join(saved,'input.json')))===existing.payload_sha256,'STORED_INPUT_MISMATCH');
      ensure(digest(await jsonRead(join(saved,'gate.json')))===existing.gate_sha256,'STORED_GATE_MISMATCH');
      await verifyHistoricalQcReplay(input);
    } else await syncQcHistory(input);
    ensure(['passed_synthetic', 'stopped_after_three'].includes(gate.qc.state), 'QC_NOT_READY');
    const jobId = digest({owner_id: input.owner_id, project_id: input.project.id, report_event_id: input.report_event_id});
    const payloadHash = digest(input), gateHash = digest(gate);
    let job = jobs.find(j => j.job_id === jobId);
    if (job) {
      ensure(job.payload_sha256 === payloadHash, 'REPORT_EVENT_CONFLICT');
      ensure(job.gate_sha256 === gateHash, 'EVIDENCE_CHANGED_SINCE_PREPARATION');
    } else {
      const prior = jobs.filter(j => j.owner_id === input.owner_id && j.project_id === input.project.id);
      const version = String(Math.max(0, ...prior.map(j => Number.parseInt(j.version))) + 1) + '.0';
      const filename = reportFilename(input.project, version);
      job = {schema_version: '0.1', job_id: jobId, owner_id: input.owner_id, project_id: input.project.id, review_id: input.review_id, report_event_id: input.report_event_id,
        payload_sha256: payloadHash, gate_sha256: gateHash, version, filename, status: 'reserved',
        delivered_path: join('reports', digest({owner_id: input.owner_id, project_id: input.project.id}), version, filename)};
      // Publish the reservation transactionally. Failed staging attempts remain
      // outside jobs/ as evidence and do not reserve a version or block loading.
      const pending = join(root, 'incomplete-initializations'); await folder(pending);
      const staged = join(pending, 'attempt-' + jobId + '-' + randomUUID()); await folder(staged);
      await atomicJson(join(staged, 'journal.json'), job);
      await rename(staged, join(root, 'jobs', jobId)); jobs.push(job);
    }
    const jobDir = join(root, 'jobs', jobId), journal = join(jobDir, 'journal.json');
    // A published journal reserves its version even if either input write fails.
    // Immutable writes let an exact retry finish initialization without replacement.
    await immutableBytes(join(jobDir,'input.json'), Buffer.from(JSON.stringify(input,null,2)+'\n'));
    await immutableBytes(join(jobDir,'gate.json'), Buffer.from(JSON.stringify(gate,null,2)+'\n'));
    interrupt(failAt, 'after-reserved');
    if (job.status === 'reserved') {
      const rendered = await renderMother({templateBytes, project: input.project, version: job.version, accepted: gate.accepted});
      await immutableBytes(join(jobDir, 'prepared.xlsx'), rendered.bytes);
      const {bytes, ...renderInfo} = rendered;
      job.artifact = {bytes: bytes.length, sha256: rendered.sha256}; job.render = renderInfo; job.status = 'prepared';
      await atomicJson(journal, job);
    }
    interrupt(failAt, 'after-prepared');
    const prepared = await verifyArtifact(join(jobDir, 'prepared.xlsx'), job.artifact);
    const deliveryDir = join(root, 'reports', digest({owner_id: input.owner_id, project_id: input.project.id}), job.version);
    await folder(join(root, 'reports', digest({owner_id: input.owner_id, project_id: input.project.id}))); await folder(deliveryDir);
    const reportPath = join(root, job.delivered_path);
    await immutableBytes(reportPath, prepared);
    await verifyArtifact(reportPath, job.artifact);
    interrupt(failAt, 'after-copy');
    const receipt = {schema_version: '0.1', kind: 'offline-provisional', scope: 'synthetic-renderer-and-local-delivery-only',
      review_id: job.review_id, report_event_id: job.report_event_id, project_id: job.project_id, version: job.version,
      report_path: job.delivered_path, report_sha256: job.artifact.sha256, bytes: job.artifact.bytes,
      payload_sha256: job.payload_sha256, snapshot_sha256: gate.snapshot_sha256, gate_sha256: job.gate_sha256, template_sha256: TEMPLATE_SHA256,
      finding_ids: gate.accepted.map(f => f.finding_id), quarantined: gate.quarantined, coverage: gate.coverage, qc: gate.qc, provisional: job.render.provisional,
      receipt_readback: 'local-file-hash-verified', drive_receipt: null, model_requests: 0, limitations: gate.limitations,
      engineering_acceptance: 'NOT_RUN', visual_acceptance: 'BLOCKED_PENDING_OWNER_SIGNOFF', product_score: 'NOT_ASSESSED'};
    const receiptPath = join(jobDir, 'receipt.json');
    await immutableBytes(receiptPath, Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
    ensure(digest(await jsonRead(receiptPath)) === digest(receipt), 'RECEIPT_READBACK_FAILED');
    interrupt(failAt, 'after-receipt');
    job.receipt_sha256 = digest(receipt); job.status = 'delivered'; await atomicJson(journal, job);
    await refreshIndex(root, jobs);
    return {status: 'PASS_OFFLINE_PROVISIONAL', report: reportPath, receipt: receiptPath, active_index: join(root, 'active-index.json'), version: job.version, report_sha256: job.artifact.sha256, accepted: gate.accepted.length, quarantined: gate.quarantined, qc: gate.qc};
  } finally { await lock.close(); await unlink(lockPath); }
}
