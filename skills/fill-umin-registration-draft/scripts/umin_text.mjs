import {readFile} from 'node:fs/promises';
export const constraints = JSON.parse(await readFile(new URL('../references/input-constraints.json', import.meta.url), 'utf8'));
const newline = text => text.replace(/\r\n?/g, '\n');

/** UMIN's documented 1/2-byte model, not UTF-8 transmission size. */
export function uminBytes(text) {
  return [...newline(text)].reduce((n, c) => n + (c.codePointAt(0) <= 0x7f ? 1 : 2), 0);
}

/** Suggestions only. The caller must reconcile them with the approved Word source. */
export function suggestAscii(text) {
  const replacements = [], simple = {'≥':'>=', '≧':'>=', '≤':'<=', '≦':'<=', '−':'-', '–':'-', '—':'-', '‘':"'", '’':"'", '“':'"', '”':'"', '\u00a0':' '};
  const value = newline(text).replace(/[^\x00-\x7f]/gu, (c, offset) => {
    let to = simple[c];
    if (c === '•' && /^(?:\s*)$/.test(newline(text).slice(0, offset).split('\n').at(-1))) to = '-';
    if (c.codePointAt(0) >= 0xff01 && c.codePointAt(0) <= 0xff5e) to = String.fromCodePoint(c.codePointAt(0) - 0xfee0);
    if (to === undefined) return c;
    replacements.push({offset, from:c, to});
    return to;
  });
  return {value, replacements, unresolved:[...new Set([...value].filter(c => c.codePointAt(0) > 0x7f))]};
}

export function validateText(field, value) {
  const issues = [], warnings = [];
  const text = newline(value);
  const ascii = field.language === '英語' || /(?:_mail\d?|_maild|_tel\d?|_teld|_url)$/.test(field.name) || ['prturl','rslturl'].includes(field.name);
  if (ascii && /[^\x20-\x7e\n]/u.test(text)) issues.push({name:field.name, code:'ascii_required', characters:[...new Set([...text].filter(c => /[^\x20-\x7e\n]/u.test(c)))]});
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(text)) issues.push({name:field.name, code:'control_character'});
  if (field.tag === 'input' && text.includes('\n')) issues.push({name:field.name, code:'single_line_field'});
  if (/[\uff61-\uff9f]/u.test(text)) issues.push({name:field.name, code:'half_width_kana_not_allowed'});
  if (/[\p{M}\p{Cs}]|[\u{10000}-\u{10ffff}]/u.test(text)) issues.push({name:field.name, code:'character_requires_review'});
  if (constraints.digitsOnly.includes(field.name) && text && !/^[0-9]+$/.test(text)) issues.push({name:field.name, code:'ascii_digits_required'});
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(text)) issues.push({name:field.name, code:'html_entity_not_allowed'});
  if (/<\/?[a-z][^>]*>/i.test(text)) issues.push({name:field.name, code:['oucmesj','oucmes'].includes(field.name) ? 'html_not_allowed_in_outcome_measures' : 'markup_requires_visual_verification'});
  const bytes = uminBytes(text), limit = constraints.maxBytes[field.name];
  if (limit !== undefined && bytes > limit) issues.push({name:field.name, code:'byte_limit_exceeded', bytes, limit, excess:bytes-limit});
  if (field.maxLength !== null && field.maxLength !== undefined && text.length > field.maxLength) issues.push({name:field.name, code:'dom_maxlength_exceeded', characters:text.length, limit:field.maxLength});
  if (limit === undefined && value) warnings.push({name:field.name, code:'byte_limit_not_documented'});
  return {issues, warnings};
}

export function validateFormText(fields) {
  const issues = [], warnings = [];
  for (const field of fields.filter(f => f.kind === 'text')) {
    const result = validateText(field, field.value);
    issues.push(...result.issues); warnings.push(...result.warnings);
  }
  for (const prefix of ['i','w']) for (const suffix of ['j','']) {
    const names = ['fname','mname','name'].map(part => `${prefix}_${part}${suffix}`);
    const group = fields.filter(f => names.includes(f.name));
    if (group.length !== 3) continue;
    const bytes = uminBytes(names.map(name => group.find(f => f.name === name).value).filter(Boolean).join(' '));
    if (bytes > constraints.combinedNameMaxBytes) issues.push({name:names.join(','), code:'combined_name_byte_limit_exceeded', bytes, limit:constraints.combinedNameMaxBytes});
  }
  return {issues, warnings};
}
