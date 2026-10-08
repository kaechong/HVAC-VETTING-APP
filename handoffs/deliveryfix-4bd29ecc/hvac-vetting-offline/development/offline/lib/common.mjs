import {createHash} from 'node:crypto';

export class OfflineError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
export const ensure = (condition, code, message) => {
  if (!condition) throw new OfflineError(code, message);
};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => sha256(canonical(value));
export const HEADERS = Object.freeze(['編號', '複核文件名稱', '問題內容', '違反法規']);
export const TEMPLATE_SHA256 = 'e968805be7b0e57f94c2a3e391c495f25730c55b9800123b15a6bf8900d56efd';
export const WORKFLOW_VERSION = 'offline-provisional-0.1';
