import {assertTarget,assertInput,assertUnchanged,clean,BASE} from './policy';
import {valueDifferences} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {Stop,type Page,type Target} from './model';
import type {BrowserPort} from './runner';
export type InstitutionKind = 'sponsors' | 'funds';
export function institutionOpenButton(kind:InstitutionKind):HTMLInputElement {
  if(!['sponsors','funds'].includes(kind))throw new Stop('institution_manual');
  const matches=[...document.querySelectorAll<HTMLInputElement>('input[type="button"]')].filter(b=>b.value==='機関選択' && b.getAttribute('onclick')===`open_estab("${kind}");`);
  if(matches.length!==1 || matches[0].disabled || !matches[0].getClientRects().length)throw new Stop('institution_manual');
  return matches[0];
}
// Self-contained: Chrome serializes this function into the newly opened popup.
export function otherInstitutionButton(kind:InstitutionKind,receipt:string,title:string,base='https://center6.umin.ac.jp/cgi-bin/ctr_test/'): true | 'server_busy' {
  const fail=()=>{throw new Error('institution_manual');};
  if(!['https://center6.umin.ac.jp/cgi-bin/ctr_test/','https://center6.umin.ac.jp/cgi-bin/ctr/'].includes(base))fail();
  if(!['sponsors','funds'].includes(kind) || location.href!==base+'ctr_estab_list.cgi?par='+kind)fail();
  // Match only the observed error page, not a phrase inside normal form data.
  if(document.body?.textContent?.replace(/\s+/g,' ').trim()==='Server is busy. Please try again later.')return 'server_busy';
  const opener=window.opener;
  if(!opener || opener.location.origin+opener.location.pathname!==base+'ctr_up_rec_f4.cgi')fail();
  const identity=(label:string)=>[...opener.document.querySelectorAll('tr')].filter((row:any)=>row.cells[0]?.textContent?.trim()===label).map((row:any)=>row.cells[1]?.textContent?.trim());
  if(JSON.stringify(identity('受付番号'))!==JSON.stringify([receipt]) || JSON.stringify(identity('科学的試験名'))!==JSON.stringify([title]))fail();
  if(!document.querySelector('h1')?.textContent?.includes('UMIN-CTR 機関選択'))fail();
  const rows=[...document.querySelectorAll('tr')].filter(row=>row.cells[0]?.textContent?.trim()==='その他');
  const buttons=rows.flatMap(row=>[...row.querySelectorAll<HTMLInputElement>('input[type="button"]')]).filter(b=>b.value==='機関選択');
  if(buttons.length!==1 || buttons[0].disabled || !buttons[0].getClientRects().length || buttons[0].getAttribute('onclick')!=='SetEstab("S0000-00000000", "その他");')fail();
  buttons[0].click();
  return true;
}
export async function selectOtherInstitution(port:BrowserPort,target:Target,before:Page,kind:InstitutionKind,signal:AbortSignal):Promise<Page> {
  signal.throwIfAborted();assertTarget(before,target);assertInput(before,'management');
  const name=kind==='sponsors'?'sponsor_nm':'fund_nm';
  const value=before.fields.find(f=>f.name===name)?.value;
  if(value==='その他')return before;
  if(value!=='')throw new Stop('institution_conflict');
  const opened:number[]=[];
  // openerTabId is optional. The injected function independently requires the
  // actual window.opener and its exact trial identity before any selection.
  const onCreated=(tab:chrome.tabs.Tab)=>{if((tab.openerTabId===undefined || tab.openerTabId===target.tabId) && tab.id!==undefined)opened.push(tab.id);};
  chrome.tabs.onCreated.addListener(onCreated);
  const deadline=Date.now()+5000;
  try {
    await port.request('open-institution',{before,target,form:'management',institution:kind});
    let clicked=false;
    while(Date.now()<deadline){
      signal.throwIfAborted();
      if(opened.length>1)throw new Stop('institution_popup_ambiguous');
      if(!clicked && opened.length===1){
        const popup=await chrome.tabs.get(opened[0]);
        if(popup.status==='complete'){
          if((popup.openerTabId!==undefined && popup.openerTabId!==target.tabId) || popup.url!==`${BASE}ctr_estab_list.cgi?par=${kind}`)throw new Stop('institution_popup_ambiguous');
          const current=await port.read();assertTarget(current,target);assertUnchanged(before,current);
          signal.throwIfAborted();
          // Mark consumed before clicking. A closed popup may prevent a reply;
          // the authoritative result is the re-read parent field below.
          clicked=true;
          let result:chrome.scripting.InjectionResult<true | 'server_busy'>[] | undefined;
          try {result=await chrome.scripting.executeScript({target:{tabId:popup.id!},world:'ISOLATED',func:otherInstitutionButton,args:[kind,target.receipt,target.scientificTitle,BASE]});}
          catch {/* Never retry a selection; verify the parent or stop. */}
          if(result?.some(r=>r.result==='server_busy'))throw new Stop('server_busy');
        }
      }
      if(clicked){
        const after=await port.read();assertTarget(after,target);assertInput(after,'management');
        if(after.documentId!==before.documentId)throw new Stop('stale_page');
        if(after.fields.find(f=>f.name===name)?.value==='その他'){
          const expected=structuredClone(before);expected.fields.find(f=>f.name===name)!.value='その他';
          clean(valueDifferences(expected,after));return after;
        }
      }
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw new Stop(clicked?'institution_selection_unverified':opened.length?'institution_popup_incomplete':'institution_popup_missing');
  } finally {chrome.tabs.onCreated.removeListener(onCreated);}
}
