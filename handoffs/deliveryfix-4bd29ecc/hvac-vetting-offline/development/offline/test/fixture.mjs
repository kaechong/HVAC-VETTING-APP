import {mkdir, writeFile} from 'node:fs/promises';
import {join,basename,dirname} from 'node:path';
import {sha256, WORKFLOW_VERSION} from '../lib/common.mjs';
import {snapshotDigest, findingDigest, inputManifestDigest, sealQcRound} from '../lib/contract.mjs';

export function signSyntheticQc(input, results = ['pass']) {
  input.snapshot.input_sha256 = inputManifestDigest(input.evidence);
  input.qc = {rounds:[]};
  for (const [i,result] of results.entries()) input.qc.rounds.push(sealQcRound(input,result,'SYNTHETIC-QC-'+(i+1)));
  return input;
}
export async function makeFixture(root, {count = 2, drawing = false, name = '合成離線驗收專案', long = false} = {}) {
  await mkdir(root, {recursive: true});
  const excerpt = 'SYNTHETIC observation: value 12 differs from synthetic required value 10.';
  const bytes = Buffer.from('[page:1]\n' + excerpt + '\nNot a real engineering document.\n');
  await writeFile(join(root, 'SYNTHETIC-source.txt'), bytes);
  const input = {schema_version: '0.1', kind: 'synthetic-offline', owner_id: 'SYNTHETIC-OWNER', review_id: 'SYNTHETIC-REVIEW-' + sha256(basename(dirname(root))+'|'+name).slice(0,16), report_event_id: 'SYNTHETIC-EXPORT-1',
    project: {id: 'SYNTHETIC-PROJECT', name, mode: 'DUAL', review_date: '2026-10-07'},
    snapshot: {workflow_version: WORKFLOW_VERSION, rules_version: 'SYNTHETIC-RULES-1', input_sha256: '0'.repeat(64), main_context_id: 'SYNTHETIC-MAIN'},
    evidence: [{evidence_id: 'E-1', file_id: 'SYNTHETIC-FILE-1', filename: 'SYNTHETIC-source.txt', relative_path: 'SYNTHETIC-source.txt', sha256: sha256(bytes), revision: 'SYNTHETIC-R1',
      page: 1, kind: drawing ? 'drawing' : 'document', drawing_id: 'SYNTHETIC-M-101', source_type: 'synthetic-text', synthetic: true, excerpt,
      object: 'SYNTHETIC-FAN', usage: 'SYNTHETIC-USAGE', operating_condition: 'SYNTHETIC-MODE', unit: 'synthetic-unit', locator: 'line 2; page marker 1'}],
    rules: ['MACAU','IBC_NFPA'].map(j => ({rule_id: 'RULE-' + j, synthetic: true, jurisdiction: j, status: 'synthetic_verified', edition: 'SYNTHETIC-2026',
      citation: (j === 'MACAU' ? '[澳門]' : '[IBC/NFPA]') + ' SYNTHETIC-2026 Test clause 1 (非真實法規)', original_text: 'Synthetic requirement 10; not a legal source',
      effective_context: 'SYNTHETIC ONLY', transition: 'SYNTHETIC ONLY', usage: 'SYNTHETIC-USAGE', trigger: 'SYNTHETIC-MODE', source_url: 'urn:synthetic:test-rule'})),
    findings: Array.from({length: count}, (_, i) => {
      const jurisdiction = i % 2 ? 'IBC_NFPA' : 'MACAU';
      return {finding_id: 'SYNTHETIC-F-' + (i + 1), checklist_id: 'CHK-' + String(i % 24 + 1).padStart(2,'0'), subcondition_id: 'SYNTHETIC-CONDITION-' + (i + 1), path: ['A','B','C','D'][i % 4],
        jurisdiction, classification: 'violation_candidate', description: (long ? '這是長中文合成文字用於檢查自動換行及行高，保留原文不作工程判斷。'.repeat(12) : '合成觀察 ' + (i + 1) + '：測試數值與合成要求不一致') + '；',
        primary_evidence_id: 'E-1', evidence_ids: ['E-1'], rule_id: 'RULE-' + jurisdiction, code_citation: (jurisdiction === 'MACAU' ? '[澳門]' : '[IBC/NFPA]') + ' SYNTHETIC-2026 Test clause 1 (非真實法規)',
        location: 'SYNTHETIC-M-101 / page 1', severity: 'Minor', suggested_action: '合成測試，無工程建議'};
    }),
    coverage: Array.from({length: 24}, (_, i) => ({checklist_id: 'CHK-' + String(i + 1).padStart(2,'0'), state: 'not_reviewed', reason: '本次只測離線契約、渲染及交付；未審工程內容或全部子條件'})), qc: {rounds: []}};
  return signSyntheticQc(input);
}
