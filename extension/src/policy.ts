import {catalog, assertIdentity, schemaIssues, formId, confirmationIssues, valueDifferences, planPatch} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {fail, type Page, type OperationTarget, type Patch} from './model';
// The production draft forms were compared read-only against all 210 fields.
// Each build admits one environment only; registered updates remain excluded.
declare const __UMIN_PRODUCTION__: boolean;
export const PRODUCTION = typeof __UMIN_PRODUCTION__ !== 'undefined' && __UMIN_PRODUCTION__;
export const ENVIRONMENT_LABEL = PRODUCTION ? '本番・登録前' : '練習環境';
const path = PRODUCTION ? '/cgi-bin/ctr/' : catalog.practicePath;
export const BASE = `${catalog.origin}${path}`;
export const ENTRY = PRODUCTION ? 'https://www.umin.ac.jp/ctr/index-j.htm' : 'https://www.umin.ac.jp/ctr/Test-HP.htm';
export const NEW_LINK = PRODUCTION ? BASE+'ctr_ins_f1.cgi' : 'https://upload.umin.ac.jp/cgi-bin/ctr_test/ctr_ins_f1.cgi';
const NOTICE = 'https://www.umin.ac.jp/ctr/new-registration.htm';
export function entryLink(url:string): {label:string;url:string} | undefined {
  if(url===ENTRY)return PRODUCTION?{label:'新規登録',url:NOTICE}:{label:'［試用系］新規登録',url:NEW_LINK};
  if(PRODUCTION && url===NOTICE)return {label:'上記、了解したので、新規登録を行う ＞',url:NEW_LINK};
}
export const validReceipt=(receipt:string)=>(PRODUCTION?/^R\d{9}$/:/^T\d{9}$/).test(receipt);
const knownFiles = ['ctr_ins_f1.cgi', 'ctr_menu_form.cgi', ...Object.values(catalog.forms).flatMap(f => f.actions.map(a => a.replace(/^\.\//,'')))];
export function assertUrl(raw: string) {
  let url: URL;
  try {url = new URL(raw);} catch {fail('outside_scope');}
  if (entryLink(url.href)) return;
  if (url.origin !== catalog.origin || !url.pathname.startsWith(path) || !knownFiles.includes(url.pathname.slice(path.length)) || url.username || url.password) fail('outside_scope');
}
export function assertTarget(page: Page, target: OperationTarget) {
  assertUrl(page.url);
  if (entryLink(page.url)) fail('wrong_trial_or_final');
  if ('newBasic' in target) {
    if (new URL(page.url).href !== BASE+'ctr_ins_f1.cgi' || formId(page) !== 'basic' ||
        !['input','confirm','saved'].includes(page.phase) || page.identity.receipt || !target.scientificTitle.trim()) fail('wrong_trial_or_final');
  } else if (new URL(page.url).pathname.endsWith('/ctr_ins_f1.cgi') || !validReceipt(target.receipt)) fail('wrong_trial_or_final');
  try {assertIdentity(page, target);} catch {fail('wrong_trial_or_final');}
}
export function clean(issues: unknown[]) {if (issues.length) fail('verification_failed');}
export function assertInput(page: Page, form: string) {clean(schemaIssues(page, form));}
export function assertUnchanged(before: Page, now: Page) {
  if (before.documentId !== now.documentId || before.url !== now.url || before.phase !== now.phase) fail('stale_page');
  clean(valueDifferences(before, now));
}
export function assertPatch(page: Page, form: string, patch: Patch) {clean(planPatch(page, form, patch).issues);}
export function assertConfirmation(expected: Page, now: Page, phase = 'confirm') {
  if (now.phase !== phase || formId(now) !== formId(expected) || now.fields.length) fail('wrong_phase');
  clean(confirmationIssues(expected, now));
  // The legacy comparison normalizes whitespace. Also verify textarea line breaks.
  for (const field of expected.fields.filter(f => f.kind === 'text' && f.tag === 'textarea')) {
    const group = now.groups.find(g => g.section === field.section && g.heading === field.heading);
    const raw = group?.paragraphs[field.paragraph]?.rawText;
    if (typeof raw !== 'string') fail('verification_failed');
    const value = raw.replace(/^(日本語|英語)[ \t]*(?:\r?\n)?/, '').replace(/\r\n?/g,'\n').trim();
    if (value !== String(field.value).replace(/\r\n?/g,'\n').trim()) fail('verification_failed');
  }
}
export function expectedAction(form: string): string {
  const entry = (catalog.forms as any)[form];
  if (!entry) fail('unknown_form');
  return entry.actions.find((s: string) => /^ctr_up_rec_f[1-6]\.cgi$/.test(s));
}
export function assertAction(action: string, expectedFile: string, base: string) {
  const url = new URL(action, base);
  if (url.href !== `${BASE}${expectedFile}`) fail('unexpected_action');
}
