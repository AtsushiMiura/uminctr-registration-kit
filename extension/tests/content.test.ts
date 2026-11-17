import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {input,escape} from './helpers';
import {BASE,ENTRY,NEW_LINK} from '../src/policy';
const bundled=await build({entryPoints:['src/content.ts'],bundle:true,write:false,platform:'browser',format:'iife'});
const productionBundle=await build({entryPoints:['src/content.ts'],bundle:true,write:false,platform:'browser',format:'iife',define:{__UMIN_PRODUCTION__:'true'}});
function html() {
 const data=input(); const groups=new Map<string,any[]>();
 for(const field of data.fields){if(!groups.has(field.heading))groups.set(field.heading,[]);groups.get(field.heading)!.push(field);}
 const fields=[...groups].map(([heading,fs])=>`<fieldset><h3>${escape(heading)}</h3>${fs.map(f=>`<p>${f.language} ${f.kind==='checkbox'?f.options.map(([v,l]:string[])=>`<label><input type="checkbox" name="${f.name}" value="${v}">${escape(l)}</label>`).join(''):`<textarea name="${f.name}"></textarea>`}</p>`).join('')}</fieldset>`).join('');
 return `<h1>${data.heading}</h1><table><tr><td>受付番号</td><td>T000000001</td></tr><tr><td>科学的試験名</td><td>架空の検証試験</td></tr></table><form method="post" action="ctr_up_rec_f1.cgi"><h2>${data.fields[0].section}</h2>${fields}<input type="submit" name=".submit" value="確認画面へ"></form><form method="post" action="ctr_menu_form.cgi"><input type="submit" name=".submit" value="フォームの選択"></form>`;
}
async function session(body=html(),url=BASE+'ctr_up_rec_f1.cgi',code=bundled.outputFiles[0].text) {
 const browser=new JSDOM(body,{url,runScripts:'outside-only'}); const w=browser.window as any;
 w.structuredClone=structuredClone;
 w.HTMLElement.prototype.getClientRects=()=>[{width:10,height:10}];
 let connect:any,handle:any;const replies:any[]=[];
 w.chrome={runtime:{id:'test-extension',onConnect:{addListener:(fn:any)=>connect=fn}}};
 w.eval(code);
 connect({name:'umin-ctr-v1',sender:{id:'test-extension'},onDisconnect:{addListener:()=>{}},onMessage:{addListener:(fn:any)=>handle=fn},postMessage:(m:any)=>replies.push(m)});
 await new Promise(resolve=>setTimeout(resolve,0));
 const send=(message:any)=>{handle({id:1,...message});return replies.pop();};
 const before=send({action:'read'}).page;
 return {w,browser,send,before,target:{tabId:1,receipt:'T000000001',scientificTitle:'架空の検証試験'}};
}
test('content adapter writes and re-reads correct fields without clicking save',async()=>{
 const s=await session();let clicks=0;s.w.document.addEventListener('click',()=>clicks++);
 const result=s.send({action:'fill',before:s.before,target:s.target,form:'basic',patch:{titlej:'架空の入力',region:['01']}});
 assert.equal(result.ok,true);assert.equal(s.w.document.querySelector('[name=titlej]').value,'架空の入力');
 assert.equal(s.w.document.querySelector('[name=region][value="01"]').checked,true);assert.equal(clicks,0);s.browser.window.close();
});
test('an exact Busy page stops reads and saves in either environment without clicking',async()=>{
 for(const production of [false,true]){
  const url=(production?'https://center6.umin.ac.jp/cgi-bin/ctr/':BASE)+'ctr_up_rec_f5.cgi';
  const s=await session('<body>Server is busy.\n Please try again later.</body>',url,production?productionBundle.outputFiles[0].text:bundled.outputFiles[0].text);
  let clicks=0;s.w.document.addEventListener('click',()=>clicks++);
  for(const action of ['read','save'])assert.equal(s.send({action}).code,'server_busy_page');
  assert.equal(clicks,0);s.browser.window.close();
 }
});
test('Busy words inside ordinary form content do not trigger a Busy-page error',async()=>{
 const s=await session(html().replace('<textarea name="titlej"></textarea>','<textarea name="titlej">Server is busy. Please try again later.</textarea>'));
 assert.equal(s.send({action:'read'}).ok,true);s.browser.window.close();
});
test('production content admits draft confirmation but never registered-update or cross-environment submission',async()=>{
 const base='https://center6.umin.ac.jp/cgi-bin/ctr/';
 for(const reason of ['valid','registered','practice','changed-schema']){
  let body=html().replaceAll('T000000001','R000000001');
  if(reason==='registered')body=body.replaceAll('ctr_up_rec_f1.cgi','ctr_up_reg_f1.cgi');
  if(reason==='practice')body=body.replace('action="ctr_up_rec_f1.cgi"','action="../ctr_test/ctr_up_rec_f1.cgi"');
  const s=await session(body,base+'ctr_up_rec_f1.cgi',productionBundle.outputFiles[0].text);
  if(reason==='changed-schema')s.w.document.querySelector('[name=title]').remove();
  let clicks=0;s.w.document.addEventListener('click',(e:any)=>{e.preventDefault();clicks++;});
  const result=s.send({action:'confirm',before:s.before,expected:s.before,target:{...s.target,receipt:'R000000001'},form:'basic'});
  assert.equal(result.ok,reason==='valid');
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(clicks,reason==='valid'?1:0);s.browser.window.close();
 }
});
test('production entry adapter follows only the observed index and notice links',async()=>{
 for(const [url,label,href] of [
  ['https://www.umin.ac.jp/ctr/index-j.htm','新規登録','https://www.umin.ac.jp/ctr/new-registration.htm'],
  ['https://www.umin.ac.jp/ctr/new-registration.htm','上記、了解したので、新規登録を行う ＞','https://center6.umin.ac.jp/cgi-bin/ctr/ctr_ins_f1.cgi'],
 ])for(const valid of [true,false]){
  const s=await session(`<a href="${valid?href:'https://example.invalid/'}">${label}</a>`,url,productionBundle.outputFiles[0].text);
  let clicks=0;s.w.document.addEventListener('click',(e:any)=>{e.preventDefault();clicks++;});
  const result=s.send({action:'open-new',before:s.before,target:{newBasic:true,scientificTitle:'架空試験',tabId:1},form:'basic'});
  assert.equal(result.ok,valid);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(clicks,valid?1:0);s.browser.window.close();
 }
});
test('wrong identity, stale values, unknown options and changed schema stop before writing',async()=>{
 for(const reason of ['identity','stale','option','schema']){
  const s=await session();let inputEvents=0;s.w.document.addEventListener('input',()=>inputEvents++);
  const target={...s.target};const patch:any={titlej:'架空の入力'};
  if(reason==='identity')target.receipt='T999999999';
  if(reason==='stale')s.w.document.querySelector('[name=title]').value='Changed externally';
  if(reason==='option')patch.region=['99'];
  if(reason==='schema')s.w.document.querySelector('[name=title]').remove();
  const result=s.send({action:'fill',before:s.before,target,form:'basic',patch});
  assert.equal(result.ok,false,reason);assert.equal(inputEvents,0,reason);assert.equal(s.w.document.querySelector('[name=titlej]').value,'');s.browser.window.close();
 }
});
test('formaction override and final registration heading never trigger a click',async()=>{
 for(const reason of ['override','final']){
  const s=await session();let clicks=0;s.w.document.addEventListener('click',(e:any)=>{e.preventDefault();clicks++;});
  if(reason==='override')s.w.document.querySelector('input[type=submit]').setAttribute('formaction','https://invalid.example/');
  else s.w.document.querySelector('h1').textContent='UMIN-CTR データの最終確認';
  const result=s.send({action:'confirm',before:s.before,expected:s.before,target:s.target,form:'basic'});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(result.ok,false);assert.equal(clicks,0);s.browser.window.close();
 }
});

test('new basic confirmation uses only its observed action and consumes navigation once',async()=>{
 const body=html().replace(/<table>.*?<\/table>/,'').replaceAll('ctr_up_rec_f1.cgi','ctr_ins_f1.cgi');
 const s=await session(body,BASE+'ctr_ins_f1.cgi');
 const target={newBasic:true,scientificTitle:s.target.scientificTitle,tabId:1};
 let clicks=0;s.w.document.addEventListener('click',(e:any)=>{e.preventDefault();clicks++;});
 const result=s.send({action:'confirm',before:s.before,expected:s.before,target,form:'basic'});
 assert.equal(result.ok,true);
 assert.equal(s.send({action:'confirm',before:s.before,expected:s.before,target,form:'basic'}).ok,false);
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(clicks,1);s.browser.window.close();
});
test('entry clicks only the exact practice link and rejects a substituted destination',async()=>{
 for(const href of [NEW_LINK,'https://example.invalid/submit']){
  const s=await session(`<a href="${href}">［試用系］新規登録</a>`,ENTRY);
  let clicks=0;s.w.document.addEventListener('click',(e:any)=>{e.preventDefault();clicks++;});
  const result=s.send({action:'open-new',before:s.before,target:{newBasic:true,scientificTitle:'架空試験',tabId:1},form:'basic'});
  assert.equal(result.ok,href===NEW_LINK);await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(clicks,href===NEW_LINK?1:0);s.browser.window.close();
 }
});
