import {readDom, formId} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {assertUrl, assertTarget, assertInput, assertUnchanged, assertPatch, assertConfirmation, assertAction, expectedAction, clean, entryLink} from './policy';
import {valueDifferences} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {fail, Stop, type Page, type OperationTarget, type Patch} from './model';
import {institutionOpenButton,type InstitutionKind} from './institution';
interface Request {id: number; action: string; target?: OperationTarget; form?: string; before?: Page; expected?: Page; patch?: Patch; institution?: InstitutionKind}
const key = '__uminCtrContentV1';
const globals = globalThis as typeof globalThis & {[key: string]: unknown};
if (!globals[key]) {
  globals[key] = true;
  const documentId = crypto.randomUUID();
  let navigating = false;
  const institutionAttempts=new Set<string>();
  const read = (): Page => {
    if (document.readyState === 'loading') fail('loading');
    assertUrl(location.href);
    if ((document.body?.innerText ?? document.body?.textContent ?? '').replace(/\s+/g,' ').trim() === 'Server is busy. Please try again later.') fail('server_busy_page');
    return {...readDom(), url: location.href, documentId} as Page;
  };
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'umin-ctr-v1' || port.sender?.id !== chrome.runtime.id) return;
    let closed = false;
    port.onDisconnect.addListener(() => {closed = true;});
    port.onMessage.addListener((request: Request) => {
      try {
        const page = read();
        if (request.action === 'read') {port.postMessage({id: request.id, ok: true, page}); return;}
        if (navigating) fail('stale_page');
        if (!request.target || !request.before) fail('missing_target');
        if (request.action === 'open-new') {
          const step=entryLink(page.url);
          if (!('newBasic' in request.target) || !step) fail('wrong_phase');
          assertUnchanged(request.before, page);
          const links = [...document.querySelectorAll<HTMLAnchorElement>('a')].filter(a => a.textContent?.trim() === step.label && a.href === step.url);
          if (links.length !== 1 || !links[0].getClientRects().length || links[0].target || links[0].hasAttribute('download')) fail('ambiguous_button');
          navigating = true;
          port.postMessage({id:request.id, ok:true, navigating:true});
          setTimeout(() => {if (!closed) links[0].click();}, 0);
          return;
        }
        assertTarget(page, request.target);
        assertUnchanged(request.before, page);
        const form = request.form || '';
        const isNew = 'newBasic' in request.target;
        if (isNew && (form !== 'basic' || !['fill','confirm','save','menu'].includes(request.action))) fail('wrong_phase');
        if(request.action==='open-institution'){
          if(form!=='management')fail('wrong_phase');assertInput(page,'management');
          const kind=request.institution;if(kind!=='sponsors' && kind!=='funds')fail('institution_manual');
          if(institutionAttempts.has(kind))fail('institution_manual');
          const field=page.fields.find(f=>f.name===(kind==='sponsors'?'sponsor_nm':'fund_nm'));
          if(field?.value!=='')fail('institution_conflict');
          const button=institutionOpenButton(kind);institutionAttempts.add(kind);
          port.postMessage({id:request.id,ok:true});
          setTimeout(()=>{if(!closed)button.click();},0);return;
        }
        const actionFile = () => isNew ? 'ctr_ins_f1.cgi' : expectedAction(form);
        let label = '', file = '';
        if (request.action === 'open') {
          if (page.phase !== 'menu') fail('wrong_phase');
          file = expectedAction(form); label = '入力';
        } else if (request.action === 'menu') {
          if (isNew && page.phase !== 'saved') fail('wrong_phase');
          if (page.phase !== 'input' && page.phase !== 'saved') fail('wrong_phase');
          if (page.phase === 'input') assertInput(page, form);
          else {if (!request.expected) fail('missing_expected'); assertConfirmation(request.expected, page, 'saved');}
          file = 'ctr_menu_form.cgi'; label = isNew ? '先に進む' : 'フォームの選択';
        } else if (request.action === 'fill') {
          assertInput(page, form);
          const patch = request.patch || {};
          assertPatch(page, form, patch);
          const expected = structuredClone(page);
          for (const field of expected.fields) if (Object.hasOwn(patch, field.name)) field.value = patch[field.name];
          for (const field of page.fields) {
            if (!Object.hasOwn(patch, field.name)) continue;
            const value = patch[field.name];
            if (field.readOnly || field.disabled) fail('readonly_field');
            const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,textarea,select')].filter(e => e.name === field.name && !(e instanceof HTMLInputElement && e.type === 'hidden'));
            if (controls.length !== field.count) fail('verification_failed');
            for (const control of controls) {
              if (control instanceof HTMLInputElement && ['checkbox','radio'].includes(control.type)) {
                const checked = Array.isArray(value) ? value.includes(control.value) : value === control.value;
                if (control.checked !== checked) {control.checked = checked; control.dispatchEvent(new Event('input', {bubbles:true})); control.dispatchEvent(new Event('change', {bubbles:true}));}
              } else if (control.value !== value) {
                const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
                control.dispatchEvent(new Event('input', {bubbles:true})); control.dispatchEvent(new Event('change', {bubbles:true}));
              }
            }
          }
          const after = read(); assertTarget(after, request.target); assertInput(after, form); clean(valueDifferences(expected, after));
          port.postMessage({id: request.id, ok: true, page: after}); return;
        } else if (request.action === 'confirm') {
          assertInput(page, form);
          if (!request.expected) fail('missing_expected');
          clean(valueDifferences(request.expected, page));
          file = actionFile(); label = '確認画面へ';
        } else if (request.action === 'save') {
          if (!request.expected) fail('missing_expected');
          assertConfirmation(request.expected, page);
          file = actionFile(); label = '登録';
        } else if (request.action === 'back') {
          if (page.phase !== 'unchanged' || formId(page) !== form) fail('wrong_phase');
          file = expectedAction(form); label = '戻る';
        } else fail('unknown_action');
        const buttons = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input[type="submit"],input[type="button"]')].filter(b => (b instanceof HTMLInputElement ? b.value : b.textContent)?.trim() === label && b.form && new URL(b.form.getAttribute('action') || '', location.href).href === new URL(file, location.href).href);
        if (buttons.length !== 1 || buttons[0].disabled || !buttons[0].getClientRects().length) fail('ambiguous_button');
        const button = buttons[0];
        if (button.hasAttribute('formaction') || button.hasAttribute('formtarget') || button.form!.target || button.form!.method.toLowerCase() !== 'post') fail('unexpected_action');
        assertAction(button.form!.getAttribute('action') || '', file, location.href);
        navigating = true;
        port.postMessage({id:request.id, ok:true, navigating:true});
        setTimeout(() => {if (!closed) button.click();}, 0);
      } catch (error) {
        port.postMessage({id:request.id, ok:false, code: error instanceof Stop ? error.code : 'operation_failed'});
      }
    });
  });
}
