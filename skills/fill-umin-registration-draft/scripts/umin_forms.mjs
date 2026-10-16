/** UMIN form operations through the caller's connected browser tab.
 * No HTTP client, browser launch, hidden inputs, or final-registration action.
 */
import { readFile } from 'node:fs/promises';
import { validateFormText } from './umin_text.mjs';

export const catalog = JSON.parse(await readFile(new URL('../references/form-catalog.json', import.meta.url), 'utf8'));
export const MENU = 'UMIN-CTR フォームの選択とデータの確認';
const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = value => Array.isArray(value) ? [...value].sort() : String(value).replace(/\r\n?/g, '\n');

/** Run only in tab.playwright.evaluate(). Reads rendered forms, never hidden fields. */
export function readDom() {
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const selector = 'textarea,input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select';
  const fields = [], groups = [];
  let section = '';
  for (const h of document.querySelectorAll('h2,h3')) {
    if (h.tagName === 'H2') { section = clean(h.textContent); continue; }
    const box = h.parentElement;
    const paragraphs = Array.from(box.querySelectorAll('p'));
    const group = { section, heading: clean(h.textContent), paragraphs: paragraphs.map(p => ({
      text: clean(p.innerText || p.textContent),
      language: clean(Array.from(p.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')).match(/^(日本語|英語)/)?.[1] || '',
      rows: Array.from(p.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('td,th')).map(c => clean(c.innerText || c.textContent))),
    })) };
    groups.push(group);
    const seen = new Set();
    for (const e of box.querySelectorAll(selector)) {
      if (!e.name || seen.has(e.name)) continue;
      seen.add(e.name);
      const peers = Array.from(box.querySelectorAll(selector)).filter(x => x.name === e.name);
      const kind = e.tagName === 'SELECT' ? 'select' : ['checkbox', 'radio'].includes(e.type) ? e.type : 'text';
      const p = e.closest('p');
      const language = clean(p ? Array.from(p.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ') : '').match(/^(日本語|英語)/)?.[1] || '';
      const row = e.closest('tr');
      const rowLabel = row && ['名', 'ミドルネーム', '姓'].includes(clean(row.cells?.[0]?.textContent)) ? clean(row.cells[0].textContent) : '';
      fields.push({ name: e.name, kind, tag: e.tagName.toLowerCase(), section, heading: group.heading,
        language, paragraph: paragraphs.indexOf(p), rowLabel, readOnly: !!e.readOnly, disabled: !!e.disabled,
        count: peers.length, maxLength: e.getAttribute('maxlength') === null ? null : Number(e.getAttribute('maxlength')),
        value: kind === 'checkbox' ? peers.filter(x => x.checked).map(x => x.value).sort() : kind === 'radio' ? peers.find(x => x.checked)?.value || '' : e.value,
        options: kind === 'select' ? Array.from(e.options).map(o => [o.value, clean(o.textContent)]) : ['checkbox', 'radio'].includes(kind) ? peers.map(o => [o.value, clean(Array.from(o.labels || []).map(l => l.textContent).join(' '))]) : undefined,
      });
    }
  }
  const heading = clean(document.querySelector('h1')?.textContent);
  const buttons = Array.from(document.querySelectorAll('input[type="submit"],input[type="button"],button')).map(e => ({label: clean(e.value || e.textContent), name: e.name, type: e.type}));
  const body = document.body.innerText || document.body.textContent;
  const rows = Array.from(document.querySelectorAll('tr'));
  const identity = {};
  for (const [label, key] of [['受付番号', 'receipt'], ['科学的試験名', 'scientificTitle']]) {
    const row = rows.find(r => clean(r.cells?.[0]?.textContent) === label);
    if (row) identity[key] = clean(row.cells[1]?.textContent);
  }
  const savedDisplay = /^UMIN-CTR .+－入力$/.test(heading) && fields.length === 0 && groups.length > 0 &&
    buttons.some(b => b.label === 'フォームの選択') && buttons.some(b => b.label === '入力中の臨床試験一覧に戻る') &&
    !buttons.some(b => ['登録','修正','確認画面へ'].includes(b.label));
  const phase = heading === 'UMIN-CTR フォームの選択とデータの確認' ? 'menu' :
    /修正箇所はありません。/.test(body) && buttons.some(b => b.label === '戻る') ? 'unchanged' :
    /下記の内容で受け付けました。/.test(body) || savedDisplay ? 'saved' :
    /入力内容を確認してください。修正を行う場合は/.test(body) && buttons.some(b => b.label === '登録') ? 'confirm' :
    fields.length ? 'input' : 'unknown';
  return { heading, identity, phase, fields, groups, buttons,
    actions: Array.from(document.forms).map(f => f.getAttribute('action')) };
}

/** Strip every case-specific value before writing a catalog. */
export function catalogForm(page, id) {
  return { id, heading: page.heading, actions: page.actions, buttons: page.buttons,
    fields: page.fields.map(({value, options, maxLength, ...field}) => /_(yyyy|mm|dd)$/.test(field.name)
      ? {...field, datePart: field.name.split('_').at(-1)} : {...field, ...(options ? {options} : {})}) };
}

export function formId(page) {
  return Object.entries(catalog.forms).find(([, form]) => form.heading === page.heading)?.[0];
}

export function assertIdentity(page, config) {
  if (/最終確認|登録処理/.test(page.heading)) throw new Error('Final registration page: stop.');
  if (config.newBasic && !config.receipt) {
    if (formId(page) !== 'basic') throw new Error('New basic information only; bind the issued receipt before continuing.');
    const title = page.fields.find(f => f.name === 'titlesj')?.value;
    if (title && norm(title) !== norm(config.scientificTitle)) throw new Error('Scientific title differs.');
    return;
  }
  if (!config.receipt || !config.scientificTitle) throw new Error('Expected receipt and scientificTitle are required.');
  if (page.identity.receipt !== config.receipt || page.identity.scientificTitle !== norm(config.scientificTitle)) {
    throw new Error('Receipt or scientific title differs: stop before any mutation.');
  }
}

export function schemaIssues(page, id) {
  const baseline = catalog.forms[id];
  if (!baseline || formId(page) !== id || page.phase !== 'input') return [{code: 'wrong_form_or_phase'}];
  const issues = [];
  const actual = new Map(page.fields.map(f => [f.name, f]));
  for (const expected of baseline.fields) {
    const field = actual.get(expected.name);
    if (!field) { issues.push({name: expected.name, code: 'missing_field'}); continue; }
    for (const key of ['kind', 'heading', 'section', 'language', 'rowLabel', 'paragraph', 'readOnly', 'disabled', 'count', 'tag']) {
      if (expected[key] !== undefined && !same(field[key], expected[key])) issues.push({name: field.name, code: 'structure_changed', key});
    }
    if (expected.options && !same(field.options, expected.options)) issues.push({name: field.name, code: 'options_changed'});
  }
  for (const field of page.fields) if (!baseline.fields.some(f => f.name === field.name)) issues.push({name: field.name, code: 'new_field'});
  return issues;
}

export function planPatch(page, id, patch) {
  const issues = schemaIssues(page, id), changes = [];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {issues: [...issues, {code: 'patch_must_be_object'}], changes};
  const fields = new Map(page.fields.map(f => [f.name, f]));
  for (const [name, desired] of Object.entries(patch)) {
    const field = fields.get(name);
    if (!field) { issues.push({name, code: 'unknown_field'}); continue; }
    const valid = field.kind === 'checkbox' ? Array.isArray(desired) && desired.every(v => typeof v === 'string') && new Set(desired).size === desired.length : typeof desired === 'string';
    if (!valid) { issues.push({name, code: 'wrong_value_type'}); continue; }
    const choices = field.kind === 'checkbox' ? desired : [desired];
    if (field.options && choices.some(v => !field.options.some(([code]) => code === v))) issues.push({name, code: 'unknown_option'});
    if (field.disabled) issues.push({name, code: 'disabled_field'});
    if (!same(canonical(desired), canonical(field.value))) {
      if (field.readOnly) issues.push({name, code: 'use_institution_picker'});
      else changes.push({name, kind: field.kind});
    }
  }
  const datePrefixes = new Set(Object.keys(patch).filter(n => /_(yyyy|mm|dd)$/.test(n)).map(n => n.replace(/_(yyyy|mm|dd)$/, '')));
  for (const prefix of datePrefixes) {
    const names = ['yyyy', 'mm', 'dd'].map(p => `${prefix}_${p}`);
    if (!names.every(n => Object.hasOwn(patch, n))) { issues.push({name: prefix, code: 'specify_all_date_parts_including_blanks'}); continue; }
    const [y,m,d] = names.map(n => patch[n]);
    if (y && m && d) {
      const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d)) issues.push({name: prefix, code: 'invalid_calendar_date'});
    }
  }
  const proposed = page.fields.map(f => ({...f, value: Object.hasOwn(patch, f.name) ? patch[f.name] : f.value}));
  const text = validateFormText(proposed.filter(f => f.kind !== 'text' || typeof f.value === 'string'));
  issues.push(...text.issues);
  return {issues, warnings:text.warnings, changes, unchanged: Object.keys(patch).length - changes.length};
}

export function valueDifferences(expected, actual) {
  const fields = new Map(actual.fields.map(f => [f.name, f]));
  return expected.fields.filter(f => !fields.has(f.name) || !same(canonical(f.value), canonical(fields.get(f.name).value))).map(f => ({name: f.name, code: 'value_changed'}));
}

/** Compare visible confirmation text, including unmodified fields. No hidden values. */
export function confirmationIssues(expected, actual) {
  const issues = [];
  const grouped = new Map();
  for (const f of expected.fields) {
    const key = JSON.stringify([f.section, f.heading, f.paragraph]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  }
  for (const fields of grouped.values()) {
    const first = fields[0];
    const groups = actual.groups.filter(g => g.section === first.section && g.heading === first.heading);
    if (groups.length !== 1) { issues.push({name: first.name, code: 'confirmation_group_missing_or_ambiguous'}); continue; }
    const p = groups[0].paragraphs[first.paragraph];
    if (!p) { issues.push({name: first.name, code: 'confirmation_paragraph_missing'}); continue; }
    if (fields.every(f => f.rowLabel)) {
      for (const f of fields) {
        const rows = p.rows.filter(r => r[0] === f.rowLabel);
        if (rows.length !== 1 || norm(rows[0].at(-1)) !== norm(f.value)) issues.push({name: f.name, code: 'confirmation_value_mismatch'});
      }
      continue;
    }
    let wanted;
    if (fields.every(f => /_(yyyy|mm|dd)$/.test(f.name))) {
      wanted = fields.every(f => f.value === '') ? '' : fields.map(f => `${f.value}${f.name.endsWith('_yyyy') ? '年' : f.name.endsWith('_mm') ? '月' : '日'}`).join('');
    } else {
      wanted = fields.map(f => f.kind === 'checkbox' ? f.options.filter(([code]) => f.value.includes(code)).map(([,label]) => label).join(' ') :
        ['select', 'radio'].includes(f.kind) ? (f.value ? f.options.find(([code]) => code === f.value)?.[1] : '') : f.value).join(' ');
    }
    const displayed = p.text.replace(/^(日本語|英語)\s*/, '');
    const isDate = fields.every(f => /_(yyyy|mm|dd)$/.test(f.name));
    if (isDate ? displayed.replace(/\s+/g, '') !== wanted.replace(/\s+/g, '') : norm(displayed) !== norm(wanted)) {
      issues.push({name: fields.map(f => f.name).join(','), code: 'confirmation_value_mismatch'});
    }
  }
  return issues;
}

function requireClean(issues) {
  if (issues.length) throw new Error(JSON.stringify({status:'stopped', issues}));
}

export function createSession(tab, config) {
  return new UminSession(tab, config);
}

class UminSession {
  constructor(tab, config) {
    this.tab = tab;
    this.config = {...config, baseUrl: config.baseUrl || `${catalog.origin}${catalog.practicePath}`};
    const url = new URL(this.config.baseUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.umin.ac.jp') || !url.pathname.endsWith('/') || url.search || url.hash) throw new Error('Use the observed HTTPS UMIN form directory as baseUrl.');
    if (!config.scientificTitle || (!config.receipt && !config.newBasic)) throw new Error('Specify the target identity.');
    this.expected = null;
    this.confirmed = false;
  }
  async read() {
    const url = await this.tab.url();
    if (!url?.startsWith(this.config.baseUrl) || new URL(url).origin !== new URL(this.config.baseUrl).origin) throw new Error('Outside the configured UMIN directory.');
    const page = await this.tab.playwright.evaluate(readDom);
    assertIdentity(page, this.config);
    return page;
  }
  async inspect() {
    const page = await this.read();
    return {form: formId(page) || null, phase: page.phase, identity: page.identity, fieldCount: page.fields.length,
      issues: page.phase === 'input' ? schemaIssues(page, formId(page)) : []};
  }
  async openForm(id) {
    const page = await this.read();
    if (page.phase !== 'menu' || !catalog.forms[id]) throw new Error('Open a known form from the menu only.');
    const action = catalog.forms[id].actions.find(a => /ctr_up_rec_f\d\.cgi$/.test(a));
    const live = page.actions.find(a => a.replace(/^\.\//, '') === action.replace(/^\.\//, ''));
    if (!live) throw new Error('Form action changed. Inspect the menu.');
    await this.navigate(this.tab.playwright.locator(`form[action=${JSON.stringify(live)}]`).getByRole('button', {name:'入力', exact:true}));
    this.expected = null; this.confirmed = false;
    const next = await this.read();
    requireClean(schemaIssues(next, id));
    return {form:id, phase:next.phase, fieldCount:next.fields.length};
  }
  async plan(id, patch) {
    const page = await this.read();
    return {form:id, ...planPatch(page, id, patch)};
  }
  async fill(id, patch) {
    const before = await this.read();
    const plan = planPatch(before, id, patch);
    requireClean(plan.issues);
    this.expected = null; this.confirmed = false;
    const expected = structuredClone(before);
    for (const field of expected.fields) if (Object.hasOwn(patch, field.name)) field.value = canonical(patch[field.name]);
    for (const change of plan.changes) {
      const field = before.fields.find(f => f.name === change.name);
      const locator = this.tab.playwright.locator(`${field.tag}[name=${JSON.stringify(field.name)}]`);
      const value = patch[field.name];
      if (field.kind === 'checkbox') {
        for (const [code] of field.options) {
          if (field.value.includes(code) !== value.includes(code)) await this.tab.playwright.locator(`input[name=${JSON.stringify(field.name)}][value=${JSON.stringify(code)}]`).setChecked(value.includes(code));
        }
      } else if (field.kind === 'select') await locator.selectOption(value);
      else if (field.kind === 'radio') await this.tab.playwright.locator(`input[name=${JSON.stringify(field.name)}][value=${JSON.stringify(value)}]`).check();
      else await locator.fill(value);
    }
    const after = await this.read();
    requireClean([...schemaIssues(after, id), ...valueDifferences(expected, after)]);
    this.expected = after;
    return {form:id, phase:'input', changed:plan.changes.length, verified:after.fields.length, differences:[], warnings:plan.warnings};
  }
  async confirm() {
    if (!this.expected) throw new Error('Call fill(), including an empty patch for verification, before confirming.');
    const before = await this.read();
    const id = formId(this.expected);
    requireClean([...schemaIssues(before, id), ...valueDifferences(this.expected, before)]);
    await this.navigate(this.tab.playwright.getByRole('button', {name:'確認画面へ', exact:true}));
    const after = await this.read();
    if (formId(after) === id && after.phase === 'unchanged') {
      this.confirmed = false;
      return {form:id, phase:'unchanged'};
    }
    if (formId(after) !== id || after.phase !== 'confirm') throw new Error('Confirmation not reached; inspect validation errors. Do not repeat the click.');
    requireClean(confirmationIssues(this.expected, after));
    this.confirmed = true;
    return {form:id, phase:'confirm', verified:this.expected.fields.length, differences:[]};
  }
  async save() {
    if (!this.confirmed || !this.expected) throw new Error('A verified individual-form confirmation is required.');
    const before = await this.read();
    if (before.phase !== 'confirm' || formId(before) !== formId(this.expected) || before.fields.length) throw new Error('Not an individual-form confirmation.');
    requireClean(confirmationIssues(this.expected, before));
    this.confirmed = false; // Consume once, including an ambiguous navigation outcome.
    await this.navigate(this.tab.playwright.getByRole('button', {name:'登録', exact:true}));
    return this.verifySaved();
  }
  async verifySaved() {
    const page = await this.read();
    if (!this.expected || page.phase !== 'saved' || formId(page) !== formId(this.expected)) throw new Error('Save outcome unverified. Inspect; never automatically resubmit.');
    requireClean(confirmationIssues(this.expected, page));
    return {form:formId(page), phase:'saved', verified:this.expected.fields.length, differences:[]};
  }
  async toMenu() {
    let page = await this.read();
    if (page.phase === 'unchanged' && this.expected && formId(page) === formId(this.expected)) {
      await this.navigate(this.tab.playwright.getByRole('button', {name:'戻る', exact:true}));
      page = await this.read();
      requireClean([...schemaIssues(page, formId(this.expected)), ...valueDifferences(this.expected, page)]);
    } else if (page.phase !== 'saved') throw new Error('Return only after a verified save or unchanged response.');
    const label = page.buttons.some(b => b.label === '先に進む') ? '先に進む' : 'フォームの選択';
    await this.navigate(this.tab.playwright.getByRole('button', {name:label, exact:true}));
    if (this.config.newBasic && !this.config.receipt) {
      const next = await this.tab.playwright.evaluate(readDom);
      if (next.phase !== 'menu' || next.identity.scientificTitle !== norm(this.config.scientificTitle) || !/^[RT]\d+$/.test(next.identity.receipt || '')) throw new Error('Issued receipt not verified.');
      this.config.receipt = next.identity.receipt;
      this.config.newBasic = false;
    }
    this.expected = null;
    return this.inspect();
  }
  async chooseInstitution(browser, role, {query='', exactName, useOther=false}) {
    if (this.pendingInstitution) throw new Error('An institution picker is already open. Use finishInstitution(), never reopen it.');
    const fields = {sponsor:'sponsor_nm', funding:'fund_nm'};
    const name = fields[role];
    const page = await this.read();
    requireClean(schemaIssues(page, 'management'));
    if (!name || (!exactName && !useOther)) throw new Error('Specify sponsor/funding and the exact institution, or explicitly useOther.');
    const field = page.fields.find(f => f.name === name);
    const beforeTabs = new Set((await browser.tabs.list()).map(t => t.id));
    const button = this.tab.playwright.getByRole('heading', {name:field.heading, exact:true}).locator('..').getByRole('button', {name:'機関選択', exact:true});
    if (await button.count() !== 1) throw new Error('Institution picker is ambiguous.');
    await button.click();
    const added = (await browser.tabs.list()).filter(t => !beforeTabs.has(t.id));
    if (added.length !== 1) throw new Error('Identify the newly opened institution window; do not guess its tab ID.');
    this.pendingInstitution = {role, name, tabId:added[0].id, query, exactName, useOther};
    return this.finishInstitution(browser);
  }
  async finishInstitution(browser) {
    if (!this.pendingInstitution) throw new Error('No pending institution picker.');
    const {role, name, tabId, query, exactName, useOther} = this.pendingInstitution;
    const main = await this.read();
    requireClean(schemaIssues(main, 'management'));
    const info = (await browser.tabs.list()).find(t => t.id === tabId);
    if (!info?.url) return {form:'management', role, status:'popup_loading', tabId};
    if (!info.url.startsWith(this.config.baseUrl)) throw new Error('Institution window is outside the configured directory.');
    const popup = await browser.tabs.get(tabId);
    const heading = popup.playwright.getByRole('heading', {name:'UMIN-CTR 機関選択', exact:true});
    if (await heading.count() !== 1) throw new Error('Unexpected institution page.');
    if (query) {
      const search = popup.playwright.locator('input[name="estab_namej"]');
      if (await search.count() !== 1) throw new Error('Institution search field changed.');
      await search.fill(query);
      await popup.playwright.expectNavigation(() => popup.playwright.getByRole('button', {name:'検索', exact:true}).click());
      if (popup.getAXState) await popup.getAXState({emit:false});
    }
    const rowFor = label => popup.playwright.getByRole('row').filter({has:popup.playwright.getByRole('cell', {name:label, exact:true})});
    let label = exactName;
    if (!label || await rowFor(label).count() === 0) {
      if (!useOther) throw new Error('No exact institution match; review the results or explicitly choose Other.');
      label = 'その他';
    }
    const row = rowFor(label);
    if (await row.count() !== 1) throw new Error('Institution match is ambiguous.');
    await row.getByRole('button', {name:'機関選択', exact:true}).click();
    const after = await this.read();
    if (after.fields.find(f => f.name === name)?.value !== label) throw new Error('Selected institution did not reach the intended field.');
    this.expected = null; this.confirmed = false;
    this.pendingInstitution = null;
    return {form:'management', role, selected:label};
  }
  async navigate(locator) {
    if (await locator.count() !== 1) throw new Error('Action is missing or ambiguous.');
    // Never retry a click on timeout: the server may already have accepted it.
    await this.tab.playwright.expectNavigation(() => locator.click());
    // The extension may return before CGI navigation settles. One AX read waits
    // for the new rendered page without a second click or a full DOM printout.
    if (this.tab.getAXState) await this.tab.getAXState({emit:false});
  }
}
