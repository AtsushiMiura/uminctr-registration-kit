import template from './template.json';
import {ageParts, MANUAL_ISSUE} from './review';
import {catalog} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {fail, normalized, type Entry, type Field, type Value} from './model';
import type {Converted} from './docx';
import {readWord, wordCell, type WordParagraph} from './word';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (e: Element, name: string) => [...e.children].filter(c => c.namespaceURI === W && c.localName === name);
const descendants = (e: Element | Document, name: string) => [...e.getElementsByTagNameNS(W, name)];
const text = (e: Element) => descendants(e, 't').map(t => t.textContent || '').join('');
const cleanChoice = (s: string) => normalized(s).replace(/^[□☐☑☒■✓✔]+/, '');
const bindings = template.bindings as Record<string, {table: number; row: number; cell: number; mode: string}>;
export const forms = ['basic', 'purpose', 'design', 'management', 'results', 'progress'];
export const fields = forms.flatMap(form => (catalog.forms as any)[form].fields.map((field: Field) => ({form, field})));
export function selectedChoice(paragraphs: WordParagraph[], field: Field): {value: Value; issue: string} {
  const candidates: {label: string; paragraph: string}[] = [];
  for (const p of paragraphs) {
    // Adjacent highlighted runs are one span even when Word splits text by font/language.
    candidates.push(...p.highlights.filter(h => cleanChoice(h)).map(label => ({label,paragraph:p.text})));
    if (/^[☑☒■✓✔]$/u.test(p.marker) || /^[\s]*[☑☒■✓✔]/u.test(p.text)) candidates.push({label:p.text,paragraph:p.text});
  }
  if (!candidates.length) return {value: field.kind === 'checkbox' ? [] : '', issue: '選択状態を確認してください'};
  const chosen = new Set<string>();
  for (const candidate of candidates) {
    const label = cleanChoice(candidate.label), paragraph = cleanChoice(candidate.paragraph);
    const matches = (field.options || []).filter(([, option]) => {
      const full = cleanChoice(option);
      const japanese = cleanChoice(option.split('/')[0]);
      return (label === full || label === japanese) && (paragraph === full || paragraph === japanese);
    });
    if (matches.length !== 1) return {value: field.kind === 'checkbox' ? [] : '', issue: '強調・チェックがどの選択肢を指すか判断できません'};
    chosen.add(matches[0][0]);
  }
  if (field.kind !== 'checkbox' && chosen.size !== 1) return {value: '', issue: '単一選択の項目で複数が選択されています'};
  return {value: field.kind === 'checkbox' ? [...chosen].sort() : [...chosen][0], issue: ''};
}
export function parseConverted(input: Converted): Entry[] {
  const xml = new DOMParser().parseFromString(input.xml, 'application/xml');
  if (xml.querySelector('parsererror')) fail('docx_parse_failed');
  if (['ins', 'del', 'moveFrom', 'moveTo', 'altChunk'].some(tag => descendants(xml, tag).length) || [...xml.getElementsByTagNameNS(W,'*')].some(e => /PrChange$|^move(From|To)Range|^(tblGridChange|numberingChange)$/.test(e.localName))) fail('revision_or_embedded_content');
  const body = descendants(xml, 'body')[0];
  if (!body || !children(body, 'p').some(p => normalized(text(p)) === normalized('UMIN-CTR登録用フォーム Version 1.2.0'))) fail('template_changed');
  const xmlTables = children(body, 'tbl');
  if (xmlTables.length !== template.tables.length || descendants(body, 'tbl').length !== xmlTables.length) fail('template_changed');
  // Inert template: generated links, images and HTML are never attached to a live document.
  const holder = document.createElement('template'); holder.innerHTML = input.html;
  const htmlTables = [...holder.content.querySelectorAll('table')];
  if (htmlTables.length !== xmlTables.length) fail('template_changed');
  const rows = xmlTables.map(t => children(t, 'tr'));
  const cells = rows.map(rs => rs.map(row => children(row, 'tc')));
  for (let ti = 0; ti < rows.length; ti++) {
    if (rows[ti].length !== template.tables[ti].length || htmlTables[ti].rows.length !== rows[ti].length) fail('template_changed');
    for (let ri = 0; ri < rows[ti].length; ri++) {
      const expected = template.tables[ti][ri];
      if (cells[ti][ri].length !== expected.cells || htmlTables[ti].rows[ri].cells.length !== expected.cells || normalized(text(cells[ti][ri][0])) !== normalized(expected.label)) fail('template_changed');
    }
  }
  for (const unmapped of template.unmappedRows) {
    if (cells[unmapped.table][unmapped.row].slice(1).some(c => text(c).trim())) fail('unmapped_content');
  }
  const inheritedHighlight = /<(?:\w+:)?highlight\b/.test(input.styles);
  const paragraphs = readWord(xml, input.numbering, input.styles);
  return fields.map(({form, field}: {form: string; field: Field}) => {
    const b = bindings[field.name];
    const xmlCell = cells[b.table][b.row][b.cell];
    const affected = b.mode === 'choice' ? cells[b.table][b.row].slice(1) : [xmlCell];
    const sourceCells = affected.map(c => wordCell(c, paragraphs));
    const source = sourceCells.map(c => c.text).join('\n');
    let value: Value = field.kind === 'checkbox' ? [] : source, issue = '';
    const unsupported = affected.some(c => ['sdt','sym','drawing','pict','fldChar','checkBox'].some(tag => descendants(c, tag).length));
    const wordIssue = sourceCells.find(c => c.issue)?.issue || '';
    const otherHighlight = affected.some(c => descendants(c, 'highlight').some(h => !['yellow','none'].includes(h.getAttributeNS(W,'val') || '')));
    if (b.mode === 'manual') {
      value = field.kind === 'checkbox' ? [] : ''; issue = MANUAL_ISSUE;
      const age = field.name.match(/^age(low|up)([ul]?)$/);
      if (age) {
        const parts = ageParts(source,age[1] as 'low'|'up');
        if (parts) {value=parts[age[2]==='u'?'unit':age[2]==='l'?'limit':'number'];issue='';}
        else if (age[2]==='u') {value='01';issue='単位の初期候補は「歳」です。原稿と照合して確定してください';}
      }
    }
    else if (b.mode === 'choice') ({value, issue} = selectedChoice(sourceCells.flatMap(c => c.paragraphs), field));
    else if (b.mode === 'count') {
      const match = source.match(/^\s*([0-9]*)\s*(?:例)?\s*$/);
      if (match) value = match[1]; else {value = ''; issue = '人数を半角数字で確定してください';}
    } else if (b.mode === 'date') {
      const match = source.match(/^\s*([0-9]*)\s*年\s*([0-9]*)\s*月\s*([0-9]*)\s*日\s*$/);
      if (match && (match.slice(1).every(Boolean) || match.slice(1).every(v => !v))) {
        const part = match[['yyyy','mm','dd'].indexOf(field.name.split('_').at(-1)!) + 1];
        value = part ? field.name.endsWith('_yyyy') ? part : part.padStart(2,'0') : '';
      } else {value = ''; issue = '日付を確認してください';}
    }
    // Conversion warnings and special fields cannot silently turn into an unselected/empty value.
    if (unsupported || wordIssue || input.warnings || (b.mode === 'choice' && (inheritedHighlight || otherHighlight))) {
      value = field.kind === 'checkbox' ? [] : b.mode === 'text' && !unsupported && !wordIssue ? source : '';
      issue = wordIssue || '書式を完全に読み取れません。Wordの原稿と照合して確定してください';
    }
    if (field.readOnly) {value = ''; issue = 'UMIN画面の機関選択で選び、事前照合で選択結果を確認してください';}
    return {form, field, value, source: wordIssue ? '（未対応の番号・書式はWord原稿で確認）\n' + source : source, issue, resolved: !issue, keep: field.readOnly};
  });
}
