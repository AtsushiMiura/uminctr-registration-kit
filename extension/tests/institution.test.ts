import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {institutionOpenButton,otherInstitutionButton,selectOtherInstitution} from '../src/institution';
import {input} from './helpers';
const receipt='T000000001', title='架空の検証試験';
test('the observed Busy response is reported without selecting anything',()=>{
 const dom=new JSDOM('<body>Server is busy.\n Please try again later.</body>',{url:'https://center6.umin.ac.jp/cgi-bin/ctr_test/ctr_estab_list.cgi?par=sponsors'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
 let clicks=0;dom.window.document.addEventListener('click',()=>clicks++);
 assert.equal(otherInstitutionButton('sponsors',receipt,title),'server_busy');
 assert.equal(clicks,0);dom.window.close();
});
test('Busy stops immediately without reopening or waiting for selection timeout',async()=>{
 const page=input('management'),target={tabId:1,receipt,scientificTitle:title};
 let created:(tab:any)=>void=()=>{},removed=false,opens=0,inspections=0,reads=0;
 Object.assign(globalThis,{chrome:{tabs:{onCreated:{addListener:(fn:any)=>{created=fn;},removeListener:()=>{removed=true;}},get:async()=>({id:2,status:'complete',openerTabId:1,url:'https://center6.umin.ac.jp/cgi-bin/ctr_test/ctr_estab_list.cgi?par=sponsors'})},scripting:{executeScript:async()=>{inspections++;return [{result:'server_busy'}];}}}});
 const port={read:async()=>{if(++reads>1)throw new Error('must stop before polling parent');return page;},request:async()=>{opens++;created({id:2,openerTabId:1});},navigate:async()=>page};
 await assert.rejects(selectOtherInstitution(port,target,page,'sponsors',new AbortController().signal),/server_busy/);
 assert.equal(opens,1);assert.equal(inspections,1);assert.equal(removed,true);
});
test('an unfinished popup stops after five seconds without selecting or reopening',async()=>{
 const page=input('management'),target={tabId:1,receipt,scientificTitle:title};
 let created:(tab:any)=>void=()=>{},removed=false,opens=0,inspections=0;
 Object.assign(globalThis,{chrome:{tabs:{onCreated:{addListener:(fn:any)=>{created=fn;},removeListener:()=>{removed=true;}},get:async()=>({id:2,status:'loading'})},scripting:{executeScript:async()=>{inspections++;}}}});
 const port={read:async()=>page,request:async()=>{opens++;created({id:2,openerTabId:1});},navigate:async()=>page};
 const start=Date.now();
 await assert.rejects(selectOtherInstitution(port,target,page,'sponsors',new AbortController().signal),/institution_popup_incomplete/);
 assert.ok(Date.now()-start>=5000);assert.ok(Date.now()-start<6500);
 assert.equal(opens,1);assert.equal(inspections,0);assert.equal(removed,true);
});
test('opening selects the exact institution button and rejects duplicate or changed controls',()=>{
 for(const reason of ['valid','duplicate','changed']){
  const control=`<input type="button" value="機関選択" onclick='open_estab("sponsors");'>`;
  const dom=new JSDOM(control+(reason==='duplicate'?control:''));Object.assign(globalThis,{document:dom.window.document});
  dom.window.HTMLElement.prototype.getClientRects=()=>[{width:10,height:10}] as any;
  if(reason==='changed')dom.window.document.querySelector('input')!.setAttribute('onclick','open_estab("unknown");');
  if(reason==='valid')assert.equal(institutionOpenButton('sponsors'),dom.window.document.querySelector('input'));
  else assert.throws(()=>institutionOpenButton('sponsors'),/institution_manual/);
  dom.window.close();
 }
});
test('other selection clicks the unique observed button in the bound popup',async()=>{
 for(const directory of ['ctr_test','ctr'])for(const kind of ['sponsors','funds'] as const){
  const base=`https://center6.umin.ac.jp/cgi-bin/${directory}/`,id=directory==='ctr'?receipt.replace(/^T/,'R'):receipt;
  const popup=new JSDOM(`<h1>UMIN-CTR 機関選択</h1><table><tr><td>その他</td><td><input type="button" value="機関選択" onclick='SetEstab("S0000-00000000", "その他");'></td></tr></table>`,{url:`${base}ctr_estab_list.cgi?par=${kind}`});
  const parent=new JSDOM(`<table><tr><td>受付番号</td><td>${id}</td></tr><tr><td>科学的試験名</td><td>${title}</td></tr></table>`,{url:base+'ctr_up_rec_f4.cgi'});
  Object.assign(popup.window,{opener:parent.window});
  Object.assign(globalThis,{window:popup.window,document:popup.window.document,location:popup.window.location});
  popup.window.HTMLElement.prototype.getClientRects=()=>[{width:10,height:10}] as any;
  let clicks=0;popup.window.document.querySelector('input')!.addEventListener('click',()=>clicks++);
  assert.equal(otherInstitutionButton(kind,id,title,base),true);
  await new Promise(r=>setTimeout(r,5));assert.equal(clicks,1);
  popup.window.close();parent.window.close();
 }
});
test('existing other is retained, and a different selected institution is never overwritten',async()=>{
 const page=input('management');const field=page.fields.find(f=>f.name==='sponsor_nm')!;
 const target={tabId:1,receipt,scientificTitle:title};
 let actions=0;const port={read:async()=>structuredClone(page),request:async()=>{actions++;},navigate:async()=>page};
 field.value='その他';
 assert.deepEqual(await selectOtherInstitution(port,target,page,'sponsors',new AbortController().signal),page);
 field.value='既に選択された機関';
 await assert.rejects(selectOtherInstitution(port,target,page,'sponsors',new AbortController().signal),/institution_conflict/);
 assert.equal(actions,0);
});
test('new popups support optional opener metadata, and unrelated parent edits stop verification',async()=>{
 for(const openerTabId of [1,undefined])for(const edited of [false,true]){
  const page=input('management'), before=structuredClone(page),target={tabId:1,receipt,scientificTitle:title};
  let created:(tab:any)=>void=()=>{},removed=false;const injected:number[]=[];
  Object.assign(globalThis,{chrome:{tabs:{onCreated:{addListener:(fn:any)=>{created=fn;},removeListener:()=>{removed=true;}},get:async(id:number)=>({id,openerTabId,url:'https://center6.umin.ac.jp/cgi-bin/ctr_test/ctr_estab_list.cgi?par=sponsors',status:'complete'})},scripting:{executeScript:async({target:t}:any)=>{injected.push(t.tabId);page.fields.find(f=>f.name==='sponsor_nm')!.value='その他';if(edited)page.fields.find(f=>f.name==='i_orgj')!.value='別の編集';return [{result:true}];}}}});
  const port={read:async()=>structuredClone(page),request:async(action:string)=>{assert.equal(action,'open-institution');created({id:88,openerTabId:9});created({id:2,openerTabId});return {};},navigate:async()=>page};
  const result=selectOtherInstitution(port,target,before,'sponsors',new AbortController().signal);
  if(edited)await assert.rejects(result,/verification_failed/);else assert.equal((await result).fields.find(f=>f.name==='sponsor_nm')!.value,'その他');
  assert.deepEqual(injected,[2]);assert.equal(removed,true);
 }
});
test('wrong parent, duplicate other choice and changed handler never click',async()=>{
 for(const reason of ['parent','missingOpener','duplicate','handler','destination']){
  const row=`<tr><td>その他</td><td><input type="button" value="機関選択" onclick='SetEstab("S0000-00000000", "その他");'></td></tr>`;
  const popup=new JSDOM(`<h1>UMIN-CTR 機関選択</h1><table>${row}${reason==='duplicate'?row:''}</table>`,{url:`https://center6.umin.ac.jp/cgi-bin/${reason==='destination'?'ctr':'ctr_test'}/ctr_estab_list.cgi?par=sponsors`});
  const parent=new JSDOM(`<table><tr><td>受付番号</td><td>${reason==='parent'?'T999999999':receipt}</td></tr><tr><td>科学的試験名</td><td>${title}</td></tr></table>`,{url:'https://center6.umin.ac.jp/cgi-bin/ctr_test/ctr_up_rec_f4.cgi'});
  Object.assign(popup.window,{opener:reason==='missingOpener'?null:parent.window});Object.assign(globalThis,{window:popup.window,document:popup.window.document,location:popup.window.location});
  popup.window.HTMLElement.prototype.getClientRects=()=>[{width:10,height:10}] as any;
  if(reason==='handler')popup.window.document.querySelector('input')!.setAttribute('onclick','unexpected()');
  let clicks=0;popup.window.document.addEventListener('click',()=>clicks++);
  assert.throws(()=>otherInstitutionButton('sponsors',receipt,title),/institution_manual/);
  await new Promise(r=>setTimeout(r,5));assert.equal(clicks,0);
  popup.window.close();parent.window.close();
 }
});
test('an unrelated destination or multiple new candidates never triggers selection',async()=>{
 for(const multiple of [false,true]){
  const page=input('management'),target={tabId:1,receipt,scientificTitle:title};
  let created:(tab:any)=>void=()=>{},removed=false,clicks=0;
  Object.assign(globalThis,{chrome:{tabs:{onCreated:{addListener:(fn:any)=>{created=fn;},removeListener:()=>{removed=true;}},get:async(id:number)=>({id,status:'complete',url:'https://example.invalid/'})},scripting:{executeScript:async()=>{clicks++;}}}});
  const port={read:async()=>page,request:async()=>{created({id:2});if(multiple)created({id:3});},navigate:async()=>page};
  await assert.rejects(selectOtherInstitution(port,target,page,'sponsors',new AbortController().signal),/institution_popup_ambiguous/);
  assert.equal(clicks,0);assert.equal(removed,true);
 }
});
