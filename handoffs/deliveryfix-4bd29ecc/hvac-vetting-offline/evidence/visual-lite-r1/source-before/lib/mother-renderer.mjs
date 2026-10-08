import ExcelJS from 'exceljs';
import {unzipSync, zipSync, strFromU8, strToU8} from 'fflate';
import {ensure, HEADERS, TEMPLATE_SHA256, sha256} from './common.mjs';

const SHEET = 'xl/worksheets/sheet2.xml';
const STYLES = 'xl/styles.xml';
const SHARED = 'xl/sharedStrings.xml';
const elements = (xml, tag) => {
  const m = xml.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>'));
  ensure(m, 'MOTHER_XML_CONTRACT'); return m;
};
const rows = xml => [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
const utf8 = xml => strToU8(xml);

function addStyles(original) {
  const existingFormats = [...original.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g)];
  let decimalId = Number(existingFormats.find(m => m[2] === '0.0')?.[1]);
  if (!Number.isInteger(decimalId)) {
    decimalId = Math.max(163, ...existingFormats.map(m => Number(m[1]))) + 1;
    const addition = '<numFmt numFmtId="' + decimalId + '" formatCode="0.0"/>';
    const formats = original.match(/<numFmts\b[^>]*(?:\/>|>[\s\S]*?<\/numFmts>)/)?.[0];
    if (formats) {
      const count = Number(formats.match(/count="(\d+)"/)[1]);
      let next = formats.replace(/count="\d+"/, 'count="' + (count + 1) + '"');
      next = next.endsWith('/>') ? next.slice(0,-2) + '>' + addition + '</numFmts>' : next.replace('</numFmts>', addition + '</numFmts>');
      original = original.replace(formats, next);
    } else original = original.replace(/(<styleSheet\b[^>]*>)/, '$1<numFmts count="1">' + addition + '</numFmts>');
  }
  const section = elements(original, 'cellXfs');
  const xfs = [...section[1].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(m => m[0]);
  const count = Number(section[0].match(/\bcount="(\d+)"/)[1]);
  ensure(count === xfs.length && count > 6, 'MOTHER_STYLE_CONTRACT');
  const wrap = (xf, numeric = false) => {
    xf = xf.replace(/\bapplyAlignment="[^"]*"/g, '').replace(/\bapplyNumberFormat="[^"]*"/g, '');
    if (numeric) xf = xf.replace(/\bnumFmtId="\d+"/, 'numFmtId="' + decimalId + '"');
    xf = xf.replace('<xf ', '<xf applyAlignment="1"' + (numeric ? ' applyNumberFormat="1"' : '') + ' ');
    if (xf.endsWith('/>')) xf = xf.slice(0, -2) + '></xf>';
    xf = xf.replace(/<alignment\b[^>]*(?:\/>|>[\s\S]*?<\/alignment>)/, '');
    return xf.replace('</xf>', '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>');
  };
  const additions = [wrap(xfs[1]), wrap(xfs[4]), wrap(xfs[4], true)];
  const updated = section[0].replace(/\bcount="\d+"/, 'count="' + (count + additions.length) + '"').replace('</cellXfs>', additions.join('') + '</cellXfs>');
  return {xml: original.replace(section[0], updated), title: count, body: count + 1, number: count + 2};
}

function estimatedHeight(values, widths, fontSize = 10, minimum = 15.75) {
  const lines = values.map((v, i) => String(v ?? '').split('\n').reduce((total, line) => {
    const units = Array.from(line).reduce((n, c) => n + (c === '\t' ? 4 : c.codePointAt(0) > 255 ? 2 : 1), 0);
    return total + Math.max(1, Math.ceil(units / Math.max(1, widths[i] - 2)));
  }, 0));
  const height = Math.max(minimum, ...lines.map(n => n * (fontSize + 3) + 4));
  ensure(height <= 409.5, 'ROW_HEIGHT_LIMIT', 'Estimated wrapped row exceeds Excel row-height limit; keep input and shorten only after review.');
  return height;
}

function scrubUnusedExamples(entries, originalSheet) {
  // Preserve shared-string indices used by the checklist; only blank unused report sample strings.
  const exampleIds = new Set();
  for (const row of rows(originalSheet)) if (Number(row[1]) >= 6) {
    for (const m of row[0].matchAll(/<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g)) exampleIds.add(Number(m[1]));
  }
  const used = new Set();
  for (const [path, bytes] of Object.entries(entries)) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
    for (const m of strFromU8(bytes).matchAll(/<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g)) used.add(Number(m[1]));
  }
  const removed = [];
  let i = 0;
  const xml = strFromU8(entries[SHARED]).replace(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g, si => {
    const index = i++; if (exampleIds.has(index) && !used.has(index)) { removed.push(index); return '<si><t></t></si>'; } return si;
  });
  entries[SHARED] = utf8(xml); return removed;
}

export async function renderMother({templateBytes, project, version, accepted}) {
  ensure(sha256(templateBytes) === TEMPLATE_SHA256, 'MOTHER_HASH_MISMATCH');
  ensure(/^\d+\.0$/.test(version) && Number.parseInt(version) > 0, 'INVALID_REPORT_VERSION');
  ensure(Array.isArray(accepted) && accepted.length <= 250, 'FINDING_LIMIT');
  const original = unzipSync(new Uint8Array(templateBytes));
  const sheet = strFromU8(original[SHEET]);
  ensure(!Object.keys(original).some(p => /vbaProject|externalLinks/.test(p)), 'UNEXPECTED_MOTHER_CONTENT');
  const inspection = new ExcelJS.Workbook(); await inspection.xlsx.load(templateBytes);
  ensure(inspection.worksheets.length === 2 && inspection.worksheets[1].name === '工作表1', 'MOTHER_SHEET_CONTRACT');
  ensure(HEADERS.every((h, i) => inspection.worksheets[1].getCell(5, i + 1).value === h), 'MOTHER_HEADERS');
  const styles = addStyles(strFromU8(original[STYLES]));
  // ExcelJS creates literal cell XML only. Overlay it on the original OOXML archive so
  // checklist, drawings, relationships, views, widths and merges survive byte-for-byte.
  const workbook = new ExcelJS.Workbook(), report = workbook.addWorksheet('工作表1');
  const widths = [12.63, 22.75, 46.88, 55.38];
  const titles = [project.name, project.review_date, version];
  for (const [i, title] of titles.entries()) {
    ensure(typeof title === 'string', 'INVALID_RENDER_VALUE');
    report.getCell(i + 1, 1).value = title;
    report.getRow(i + 1).height = estimatedHeight([title], [widths.reduce((a,b) => a+b, 0)], 14);
  }
  // Provisional: retain fifteen reserved numbered rows. They are not Finding records.
  const dataRows = Math.max(15, accepted.length);
  for (let i = 0; i < dataRows; i++) {
    const f = accepted[i];
    if (f) {
      ensure(f.number === i + 1 && [f.document, f.problem, f.citation].every(v => typeof v === 'string' && v.length <= 8000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(v)) && f.problem.endsWith('；'), 'INVALID_RENDER_VALUE');
    }
    const values = [i + 1, f?.document ?? null, f?.problem ?? null, f?.citation ?? null];
    const row = report.getRow(i + 6); values.forEach((v, c) => {
      const cell = row.getCell(c + 1); cell.value = v;
      // Force styled null cells into OOXML, preserving the reserved blank-row borders.
      cell.font = {name: 'Arial'};
    });
    if (f) row.height = estimatedHeight(values, widths);
  }
  const generated = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer({useSharedStrings: false})));
  let generatedData = elements(strFromU8(generated['xl/worksheets/sheet1.xml']), 'sheetData')[1];
  // ExcelJS's document writer can still emit shared strings despite the option.
  // Resolve its private string table into inline literals; never reuse its indices
  // against the mother's different shared-string table.
  if (generated['xl/sharedStrings.xml']) {
    const strings = [...strFromU8(generated['xl/sharedStrings.xml']).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m => m[1]);
    generatedData = generatedData.replace(/<c\b([^>]*\bt="s"[^>]*)><v>(\d+)<\/v><\/c>/g, (full, attrs, index) => {
      ensure(strings[Number(index)] !== undefined, 'GENERATED_SHARED_STRING_MISSING');
      return '<c' + attrs.replace('t="s"', 't="inlineStr"') + '><is>' + strings[Number(index)] + '</is></c>';
    });
  }
  const originalRows = new Map(rows(sheet).map(m => [Number(m[1]), m[0]]));
  const renderedRows = rows(generatedData).map(m => {
    const n = Number(m[1]);
    return m[0].replace(/<c\b([^>]*?)(\/?>)/g, (full, attrs, end) => {
      const col = attrs.match(/\br="([A-D])\d+"/)?.[1];
      ensure(col, 'UNEXPECTED_RENDER_COLUMN');
      attrs = attrs.replace(/\s+s="\d+"/, '');
      const style = n <= 3 ? styles.title : col === 'A' ? styles.number : styles.body;
      return '<c' + attrs + ' s="' + style + '"' + end;
    });
  });
  const data = renderedRows.filter(r => Number(r.match(/\br="(\d+)"/)[1]) <= 3).join('') + originalRows.get(4) + originalRows.get(5) + renderedRows.filter(r => Number(r.match(/\br="(\d+)"/)[1]) >= 6).join('');
  const updated = sheet.replace(elements(sheet, 'sheetData')[0], '<sheetData>' + data + '</sheetData>');
  const entries = {...original, [SHEET]: utf8(updated), [STYLES]: utf8(styles.xml)};
  const scrubbedExampleStringIds = scrubUnusedExamples(entries, sheet);
  ensure(sha256(entries['xl/worksheets/sheet1.xml']) === sha256(original['xl/worksheets/sheet1.xml']), 'CHECKLIST_CHANGED');
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([p,b]) => [p,[b,{mtime: new Date('1980-01-01T00:00:00Z')}]])), {level: 6});
  ensure(bytes.byteLength <= 4194304, 'REPORT_SIZE_LIMIT');
  return {bytes, sha256: sha256(bytes), finding_count: accepted.length, reserved_rows: dataRows - accepted.length,
    template_sha256: TEMPLATE_SHA256, sheets: inspection.worksheets.map(s => s.name),
    changed_parts: Object.keys(entries).filter(p => sha256(entries[p]) !== sha256(original[p])), scrubbed_example_string_ids: scrubbedExampleStringIds,
    provisional: {reserved_numbered_rows: 15, examples: 'Original preserved; unused output sample strings cleared', wrap_and_row_height: 'bounded character-width estimate; visual sign-off pending', formal_acceptance: false}};
}
