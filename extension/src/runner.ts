import {planPatch, valueDifferences, formId} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {assertTarget, assertInput, assertConfirmation, assertUnchanged, clean, entryLink, validReceipt, assertUrl} from './policy';
import {fail, formNames, type Page, type Patch, type Target} from './model';
export interface BrowserPort {
 read(): Promise<Page>;
 request(action: string, data?: object): Promise<any>;
 navigate(action: string, data: {before: Page} & Record<string, unknown>, signal: AbortSignal): Promise<Page>;
}
export type Baselines = Record<string, Page>;
export async function inspectAll(port: BrowserPort, target: Target, ids: string[], signal: AbortSignal, progress: (text: string) => void, keepManagementOpen = false): Promise<Baselines> {
  let page = await port.read(); assertTarget(page, target);
  if (page.phase !== 'menu') fail('start_at_menu');
  const baseline: Baselines = {};
  const ordered=keepManagementOpen?[...ids.filter(id=>id!=='management'),...ids.filter(id=>id==='management')]:ids;
  for (const form of ordered) {
    signal.throwIfAborted(); progress(`${formNames[form]}：入力前の状態を照合中`);
    page = await port.navigate('open', {before:page, target, form}, signal);
    assertTarget(page, target); assertInput(page, form); baseline[form] = page;
    if(keepManagementOpen && form==='management')continue;
    page = await port.navigate('menu', {before:page, target, form}, signal);
    assertTarget(page, target); if (page.phase !== 'menu') fail('wrong_phase');
  }
  return baseline;
}
export function validatePlans(baselines: Baselines, patches: Record<string, Patch>) {
  for (const [form, patch] of Object.entries(patches)) {
    if (!baselines[form]) fail('preflight_required');
    clean(planPatch(baselines[form], form, patch).issues);
  }
}
export async function runAll(port: BrowserPort, target: Target, baseline: Baselines, patches: Record<string, Patch>, signal: AbortSignal, progress: (text: string) => void) {
  validatePlans(baseline, patches);
  let page = await port.read(); assertTarget(page, target);
  const currentManagement=page.phase==='input' && formId(page)==='management' && !!patches.management;
  if (page.phase !== 'menu' && !currentManagement) fail('start_at_menu');
  if(currentManagement)assertUnchanged(baseline.management,page);
  const ordered=Object.entries(patches).sort(([a],[b])=>currentManagement?(a==='management'?-1:b==='management'?1:0):0);
  for (const [index,[form, patch]] of ordered.entries()) {
    signal.throwIfAborted(); progress(`${formNames[form]}：転記中`);
    if(!(currentManagement && index===0))page = await port.navigate('open', {before:page, target, form}, signal);
    assertTarget(page, target); assertInput(page, form);
    clean(valueDifferences(baseline[form], page)); // A changed baseline needs a new review.
    const plan = planPatch(page, form, patch); clean(plan.issues);
    if (!plan.changes.length) {
      page = await port.navigate('menu', {before:page, target, form}, signal);
    } else {
      signal.throwIfAborted();
      page = (await port.request('fill', {before:page, target, form, patch})).page;
      assertTarget(page, target); assertInput(page, form);
      const expected = page;
      page = await port.navigate('confirm', {before:page, target, form, expected}, signal);
      assertTarget(page, target);
      if (page.phase === 'unchanged' && formId(page) === form) {
        page = await port.navigate('back', {before:page, target, form}, signal);
        assertTarget(page, target); assertInput(page, form); clean(valueDifferences(expected, page));
        page = await port.navigate('menu', {before:page, target, form}, signal);
      } else {
        assertConfirmation(expected, page);
        progress(`${formNames[form]}：保存し、保存結果を照合中`);
        page = await port.navigate('save', {before:page, target, form, expected}, signal);
        assertTarget(page, target); assertConfirmation(expected, page, 'saved');
        page = await port.navigate('menu', {before:page, target, form, expected}, signal);
      }
    }
    assertTarget(page, target); if (page.phase !== 'menu') fail('wrong_phase');
    progress(`${formNames[form]}：照合済み`);
  }
  progress('対象フォームの照合が完了しました。フォーム選択画面で停止しています。');
}

// Receipt-less operations are confined to the new basic-information form.
export async function inspectNew(port: BrowserPort, target: import('./model').NewTarget, signal: AbortSignal): Promise<Page> {
  let page = await port.read();
  const visited=new Set<string>();
  while(entryLink(page.url)) {
    signal.throwIfAborted();assertUrl(page.url);
    if(visited.has(page.url))fail('wrong_phase');visited.add(page.url);
    page=await port.navigate('open-new',{before:page,target,form:'basic'},signal);
  }
  assertTarget(page,target); assertInput(page,'basic');
  // Never take over an already populated new form: it may be a previous attempt.
  if (page.fields.some(f => Array.isArray(f.value) ? f.value.length : String(f.value).trim())) fail('new_form_not_empty');
  return page;
}
export async function createNew(port: BrowserPort, target: import('./model').NewTarget, baseline: Page, patch: Patch, signal: AbortSignal): Promise<Target> {
  signal.throwIfAborted();
  let page = await port.read(); assertTarget(page,target); assertInput(page,'basic');
  assertUnchanged(baseline,page); clean(planPatch(page,'basic',patch).issues);
  if (String(patch.titlesj ?? '').replace(/\s+/g,' ').trim() !== target.scientificTitle.replace(/\s+/g,' ').trim()) fail('wrong_trial_or_final');
  page = (await port.request('fill',{before:page,target,form:'basic',patch})).page;
  assertTarget(page,target); assertInput(page,'basic');
  const expected = page;
  page = await port.navigate('confirm',{before:page,target,form:'basic',expected},signal);
  assertTarget(page,target); assertConfirmation(expected,page);
  page = await port.navigate('save',{before:page,target,form:'basic',expected},signal);
  assertTarget(page,target); assertConfirmation(expected,page,'saved');
  page = await port.navigate('menu',{before:page,target,form:'basic',expected},signal);
  if (page.phase !== 'menu' || !validReceipt(page.identity.receipt || '')) fail('wrong_trial_or_final');
  const bound = {tabId:target.tabId, scientificTitle:target.scientificTitle, receipt:page.identity.receipt!};
  assertTarget(page,bound);
  return bound;
}
