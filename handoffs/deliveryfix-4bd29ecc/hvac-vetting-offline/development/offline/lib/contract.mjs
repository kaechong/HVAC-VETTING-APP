import Ajv from 'ajv';
import {readFile, realpath, lstat} from 'node:fs/promises';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import findingSchema from '../finding.schema.json' with {type: 'json'};
import {ensure, digest, sha256, WORKFLOW_VERSION} from './common.mjs';

const validateFinding = new Ajv({allErrors: true, strict: true}).compile(findingSchema);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 8000;
const noControls = value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(value);
const requireText = (value, code) => ensure(text(value) && noControls(value), code);
const unique = (items, key, code) => {
  const keys = items.map(x => x[key]); ensure(keys.every(id) && new Set(keys).size === keys.length, code);
};
export const reviewSnapshot = input => ({
  owner_id: input.owner_id, review_id: input.review_id,
  project: input.project, snapshot: input.snapshot, findings: input.findings,
  evidence: input.evidence, rules: input.rules, coverage: input.coverage
});
export const snapshotDigest = input => digest(reviewSnapshot(input));
export const findingDigest = finding => digest(finding);
export const inputManifestDigest = evidence => digest(evidence.map(e => ({file_id: e.file_id, sha256: e.sha256, revision: e.revision})).sort((a,b) => a.file_id.localeCompare(b.file_id) || a.sha256.localeCompare(b.sha256)));

function validateReviewData(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_INPUT');
  ensure(input.kind === 'synthetic-offline' && input.schema_version === '0.1', 'OFFLINE_SYNTHETIC_ONLY');
  ensure(id(input.owner_id) && id(input.review_id) && id(input.report_event_id), 'INVALID_ID');
  ensure(input.project && id(input.project.id), 'INVALID_PROJECT');
  requireText(input.project.name, 'INVALID_PROJECT');
  ensure(input.project.name.length <= 200 && !/[\/\\<>:"|?*]/.test(input.project.name), 'UNSAFE_PROJECT_FILENAME');
  ensure(['MACAU', 'IBC_NFPA', 'DUAL'].includes(input.project.mode), 'INVALID_MODE');
  const date = input.project.review_date;
  ensure(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date, 'INVALID_DATE');
  ensure(input.snapshot?.workflow_version === WORKFLOW_VERSION && id(input.snapshot.rules_version) && hash(input.snapshot.input_sha256) && id(input.snapshot.main_context_id), 'INVALID_SNAPSHOT');
  for (const k of ['findings', 'evidence', 'rules', 'coverage']) ensure(Array.isArray(input[k]) && input[k].length <= 2000, 'INVALID_COLLECTION');
  ensure(input.findings.length <= 250, 'FINDING_LIMIT');
  unique(input.findings, 'finding_id', 'DUPLICATE_FINDING_ID');
  unique(input.evidence, 'evidence_id', 'DUPLICATE_EVIDENCE_ID');
  unique(input.rules, 'rule_id', 'DUPLICATE_RULE_ID');
  unique(input.coverage, 'checklist_id', 'DUPLICATE_COVERAGE_ID');
  const checklist = Array.from({length: 24}, (_, i) => 'CHK-' + String(i + 1).padStart(2, '0'));
  ensure(input.coverage.length === 24 && checklist.every(k => input.coverage.some(x => x.checklist_id === k)), 'INCOMPLETE_24_REGISTER');
  for (const c of input.coverage) {
    ensure(['not_reviewed', 'issue', 'no_issue', 'not_applicable', 'missing_data', 'unsupported', 'norm_pending'].includes(c.state), 'INVALID_COVERAGE');
    requireText(c.reason, 'COVERAGE_REASON_REQUIRED');
  }
  for (const f of input.findings) {
    ensure(validateFinding(f), 'FINDING_SCHEMA', JSON.stringify(validateFinding.errors));
    for (const k of ['description', 'code_citation', 'location', 'subcondition_id']) requireText(f[k], 'INVALID_CELL_TEXT');
    ensure(noControls(f.suggested_action), 'INVALID_CELL_TEXT');
    ensure(f.description.endsWith('；'), 'DESCRIPTION_TERMINATOR_REQUIRED');
    ensure(f.evidence_ids.includes(f.primary_evidence_id), 'PRIMARY_EVIDENCE_NOT_REFERENCED');
    ensure(input.project.mode === 'DUAL' || input.project.mode === f.jurisdiction, 'JURISDICTION_MISMATCH');
  }
  for (const e of input.evidence) {
    ensure(id(e.file_id) && hash(e.sha256) && text(e.revision) && text(e.filename), 'INVALID_EVIDENCE');
    ensure(['drawing', 'document'].includes(e.kind) && Number.isInteger(e.page) && e.page > 0 && e.page <= 10000, 'INVALID_EVIDENCE_POSITION');
    for (const k of ['excerpt', 'object', 'usage', 'operating_condition', 'unit', 'locator']) requireText(e[k], 'INCOMPLETE_EVIDENCE');
    if (e.kind === 'drawing') requireText(e.drawing_id, 'DRAWING_ID_REQUIRED');
    ensure(e.synthetic === true && e.source_type === 'synthetic-text', 'NON_SYNTHETIC_EVIDENCE');
    ensure(text(e.relative_path) && !isAbsolute(e.relative_path) && !e.relative_path.split(/[\/\\]/).includes('..'), 'UNSAFE_SOURCE_PATH');
    ensure(!/[\/\\<>:"|?*]/.test(e.filename), 'UNSAFE_SOURCE_FILENAME');
  }
  ensure(input.snapshot.input_sha256 === inputManifestDigest(input.evidence), 'INPUT_MANIFEST_MISMATCH');
  for (const r of input.rules) {
    ensure(r.synthetic === true && ['MACAU', 'IBC_NFPA'].includes(r.jurisdiction), 'NON_SYNTHETIC_RULE');
    for (const k of ['edition', 'citation', 'original_text', 'effective_context', 'transition', 'usage', 'trigger', 'source_url']) requireText(r[k], 'INCOMPLETE_RULE_PROVENANCE');
    ensure(['synthetic_verified', 'pending', 'blocked'].includes(r.status), 'INVALID_RULE_STATUS');
  }
  return input;
}

export function sealQcRound(input, result, context_id) {
  const q = {round: input.qc.rounds.length + 1, context_id,
    snapshot: structuredClone(reviewSnapshot(input)), snapshot_sha256: snapshotDigest(input),
    previous_receipt_sha256: input.qc.rounds.at(-1)?.receipt_sha256 ?? '0'.repeat(64),
    decisions: input.findings.map(f => ({finding_id:f.finding_id, finding_sha256:findingDigest(f), result,
      reason:'合成 QC 收據，僅測門禁及輪數，沒有執行工程覆核'}))};
  return {...q, receipt_sha256:digest(q)};
}

export function validateInput(input) {
  validateReviewData(input);
  ensure(input.qc && Array.isArray(input.qc.rounds) && input.qc.rounds.length <= 3, 'QC_THREE_ROUND_LIMIT');
  const contexts = new Set();
  for (const [i, q] of input.qc.rounds.entries()) {
    const {receipt_sha256, ...body} = q;
    ensure(hash(receipt_sha256) && receipt_sha256 === digest(body), 'QC_RECEIPT_TAMPERED');
    ensure(q.previous_receipt_sha256 === (i ? input.qc.rounds[i-1].receipt_sha256 : '0'.repeat(64)), 'QC_RECEIPT_CHAIN');
    ensure(q.snapshot && q.snapshot_sha256 === digest(q.snapshot), 'QC_SNAPSHOT_TAMPERED');
    // Validate each round against its own immutable review data, never the latest Finding.
    validateReviewData({...q.snapshot, kind:input.kind, schema_version:input.schema_version, report_event_id:input.report_event_id});
    ensure(q.snapshot.owner_id === input.owner_id && q.snapshot.review_id === input.review_id && q.snapshot.project.id === input.project.id, 'QC_LINEAGE_MISMATCH');
    ensure(q.round === i + 1 && id(q.context_id) && q.context_id !== q.snapshot.snapshot.main_context_id && !contexts.has(q.context_id), 'QC_CONTEXT_NOT_ISOLATED');
    contexts.add(q.context_id);
    ensure(Array.isArray(q.decisions) && q.decisions.length === q.snapshot.findings.length, 'INCOMPLETE_QC_DECISIONS');
    unique(q.decisions, 'finding_id', 'DUPLICATE_QC_ID');
    for (const d of q.decisions) {
      const f = q.snapshot.findings.find(x => x.finding_id === d.finding_id);
      ensure(f && d.finding_sha256 === findingDigest(f) && ['pass','fail'].includes(d.result) && text(d.reason), 'INVALID_QC_DECISION');
    }
    if (i && input.qc.rounds[i-1].decisions.every(d => d.result === 'pass'))
      ensure(q.snapshot_sha256 !== input.qc.rounds[i-1].snapshot_sha256, 'QC_ALREADY_PASSED');
  }
  return input;
}

async function verifySource(e, sourceRoot) {
  const root = await realpath(sourceRoot);
  const target = resolve(root, e.relative_path);
  const rel = relative(root, target);
  ensure(rel && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel), 'UNSAFE_SOURCE_PATH');
  // Do not follow any symlink in the approved synthetic source directory.
  let part = root;
  for (const piece of rel.split(sep)) { part = resolve(part, piece); ensure(!(await lstat(part)).isSymbolicLink(), 'SOURCE_SYMLINK'); }
  const stat = await lstat(target); ensure(stat.isFile() && stat.size <= 1048576, 'SOURCE_SIZE_LIMIT');
  const bytes = await readFile(target);
  ensure(sha256(bytes) === e.sha256, 'SOURCE_HASH_MISMATCH');
  const source = bytes.toString('utf8');
  // Synthetic-text sources have an explicit page marker; this is not PDF parsing.
  ensure(source.includes('[page:' + e.page + ']'), 'SOURCE_PAGE_MISMATCH');
  const page = source.split('[page:' + e.page + ']')[1].split(/\[page:\d+\]/)[0];
  ensure(page.includes(e.excerpt), 'EXCERPT_NOT_IN_SOURCE');
}

export async function gateFindings(input, sourceRoot) {
  validateInput(input);
  const last = input.qc.rounds.at(-1), current = last?.snapshot_sha256 === snapshotDigest(input), accepted = [], quarantined = [];
  for (const f of input.findings) {
    const reasons = [], sources = [];
    if (f.classification !== 'violation_candidate') reasons.push('NON_VIOLATION_APP_ONLY');
    const decision = last?.decisions.find(d => d.finding_id === f.finding_id);
    if (last && !current) reasons.push('QC_APPROVAL_STALE');
    if (!current || !decision || decision.result !== 'pass') reasons.push(last?.round === 3 ? 'QC_STOPPED_AFTER_THREE' : 'QC_NOT_PASSED');
    for (const evidenceId of f.evidence_ids) {
      const e = input.evidence.find(x => x.evidence_id === evidenceId);
      if (!e) { reasons.push('UNKNOWN_SOURCE:' + evidenceId); continue; }
      try { await verifySource(e, sourceRoot); sources.push(e); }
      catch (error) { if (!error.code || !['ENOENT','ENOTDIR','SOURCE_HASH_MISMATCH','EXCERPT_NOT_IN_SOURCE','SOURCE_PAGE_MISMATCH','SOURCE_SYMLINK','SOURCE_SIZE_LIMIT','UNSAFE_SOURCE_PATH'].includes(error.code)) throw error; reasons.push(error.code + ':' + evidenceId); }
    }
    const r = input.rules.find(x => x.rule_id === f.rule_id);
    if (!r) reasons.push('UNKNOWN_RULE');
    else {
      if (r.status !== 'synthetic_verified') reasons.push('RULE_NOT_VERIFIED');
      if (r.jurisdiction !== f.jurisdiction || r.citation !== f.code_citation) reasons.push('RULE_CITATION_MISMATCH');
      if (sources.some(e => e.usage !== r.usage || e.operating_condition !== r.trigger)) reasons.push('RULE_APPLICABILITY_MISMATCH');
      if (!f.code_citation.startsWith(f.jurisdiction === 'MACAU' ? '[澳門]' : '[IBC/NFPA]')) reasons.push('CITATION_SYSTEM_REQUIRED');
    }
    const primary = sources.find(e => e.evidence_id === f.primary_evidence_id);
    if (!primary) reasons.push('PRIMARY_SOURCE_UNVERIFIED');
    if (reasons.length) quarantined.push({finding_id: f.finding_id, reasons: [...new Set(reasons)]});
    else accepted.push({finding_id: f.finding_id, number: accepted.length + 1, document: primary.kind === 'drawing' ? primary.drawing_id : primary.filename + ' p.' + primary.page, problem: f.description, citation: f.code_citation});
  }
  const qcState = !last ? 'not_run' : !current ? (last.round === 3 ? 'stopped_after_three' : 'approval_stale') : last.decisions.every(d => d.result === 'pass') ? 'passed_synthetic' : last.round === 3 ? 'stopped_after_three' : 'needs_revision';
  return {accepted, quarantined, qc: {rounds_used: input.qc.rounds.length, state: qcState}, coverage: input.coverage,
    snapshot_sha256: snapshotDigest(input), limitations: ['SYNTHETIC_ONLY', 'NOT_ENGINEERING_ACCEPTANCE', 'ZERO_FINDINGS_IS_NOT_COMPLIANCE', 'FULL_SUBCONDITION_MAPPING_PENDING']};
}

export function appendQcRound(input, round) {
  validateInput(input); ensure(input.qc.rounds.length < 3, 'QC_THREE_ROUND_LIMIT');
  const last = input.qc.rounds.at(-1);
  ensure(!(last?.snapshot_sha256 === snapshotDigest(input) && last.decisions.every(d => d.result === 'pass')), 'QC_ALREADY_PASSED');
  ensure(round.snapshot_sha256 === snapshotDigest(input), 'QC_ROUND_NOT_CURRENT');
  const next = structuredClone(input); next.qc.rounds.push(round); validateInput(next); return next;
}
