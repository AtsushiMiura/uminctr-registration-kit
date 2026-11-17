import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAll,runAll,type BrowserPort} from '../src/runner';
import {assertAction,assertUrl,BASE} from '../src/policy';
import type {Page,Patch} from '../src/model';
import {input,menu,confirmed} from './helpers';
const target={tabId:1,receipt:'T000000001',scientificTitle:'架空の検証試験'};
const signal=()=>new AbortController().signal;
class Fake implements BrowserPort {
 page=menu(); log:string[]=[]; saved:Record<string,Page>={}; uncertain=false; changed=false; badConfirmation=false;
 async read(){return structuredClone(this.page);}
 async request(action:string,data:any){
  this.log.push(action);
  if(action==='fill')for(const f of this.page.fields)if(Object.hasOwn(data.patch,f.name))f.value=data.patch[f.name];
  return {page:await this.read()};
 }
 async navigate(action:string,data:any,_signal:AbortSignal){
  this.log.push(action);
  if(action==='open'){
   this.page=structuredClone(this.saved[data.form]||input(data.form));
   if(this.changed)this.page.fields[0].value='外部変更';
  }
  else if(action==='menu')this.page=menu();
  else if(action==='confirm'){
   this.page=confirmed(data.expected);
   if(this.badConfirmation)this.page.groups[0].paragraphs[0].text='欠落';
  }else if(action==='save'){
   if(this.uncertain)throw new Error('response lost');
   this.saved[data.form]=structuredClone(data.expected);this.page=confirmed(data.expected,'saved');
  }else throw new Error('unexpected command');
  return this.read();
 }
}
test('preflight never fills or saves; complete run stops at menu',async()=>{
 const port=new Fake(); const before=await inspectAll(port,target,['basic'],signal(),()=>{});
 assert.deepEqual(port.log,['open','menu']); port.log=[];
 await runAll(port,target,before,{basic:{titlej:'架空タイトル'}},signal(),()=>{});
 assert.deepEqual(port.log,['open','fill','confirm','save','menu']); assert.equal(port.page.phase,'menu');
});
test('identical values do not save; wrong trial and final pages do not mutate',async()=>{
 const port=new Fake(); const baseline={basic:input()};
 await runAll(port,target,baseline,{basic:{titlej:''}},signal(),()=>{});
 assert.deepEqual(port.log,['open','menu']); port.log=[];
 port.page.identity.receipt='T999999999';
 await assert.rejects(runAll(port,target,baseline,{basic:{}},signal(),()=>{}),/wrong_trial_or_final/);assert.equal(port.log.length,0);
 port.page=menu();port.page.heading='UMIN-CTR データの最終確認';
 await assert.rejects(runAll(port,target,baseline,{basic:{}},signal(),()=>{}),/wrong_trial_or_final/);assert.equal(port.log.length,0);
});
test('changed baseline or invalid patch stops before fill',async()=>{
 const port=new Fake();port.changed=true;
 await assert.rejects(runAll(port,target,{basic:input()},{basic:{titlej:'架空'}},signal(),()=>{}),/verification_failed/);
 assert.deepEqual(port.log,['open']);
 port.log=[];
 await assert.rejects(runAll(port,target,{basic:input()},{basic:{region:['99']}},signal(),()=>{}),/verification_failed/);
 assert.deepEqual(port.log,[]);
});
test('confirmation mismatch and uncertain save never trigger a save retry',async()=>{
 const port=new Fake();port.badConfirmation=true;
 await assert.rejects(runAll(port,target,{basic:input()},{basic:{titlej:'架空'}},signal(),()=>{}),/verification_failed/);
 assert.equal(port.log.includes('save'),false);
 const other=new Fake();other.uncertain=true;
 await assert.rejects(runAll(other,target,{basic:input()},{basic:{titlej:'架空'}},signal(),()=>{}),/response lost/);
 assert.equal(other.log.filter(x=>x==='save').length,1);assert.equal(other.log.at(-1),'save');
});
test('abort prevents next navigation; production, foreign and final URLs are rejected',async()=>{
 const port=new Fake(),controller=new AbortController();controller.abort();
 await assert.rejects(runAll(port,target,{basic:input()},{basic:{}},controller.signal,()=>{}));assert.deepEqual(port.log,[]);
 for(const url of ['https://example.com/cgi-bin/ctr_test/ctr_menu_form.cgi','https://center6.umin.ac.jp/cgi-bin/ctr/ctr_menu_form.cgi',BASE+'ctr_final.cgi',BASE+'nested/ctr_menu_form.cgi'])assert.throws(()=>assertUrl(url),/outside_scope/);
 assert.throws(()=>assertAction('https://invalid.example/submit','ctr_up_rec_f1.cgi',BASE),/unexpected_action/);
});
test('confirmation rejects missing line breaks even if words are identical',async()=>{
 const port=new Fake();
 const original=port.navigate.bind(port);
 port.navigate=async(action,data,s)=>{
  const result=await original(action,data,s);
  if(action==='confirm')result.groups[0].paragraphs[0].rawText='日本語\n一行目 二行目';
  return result;
 };
 await assert.rejects(runAll(port,target,{basic:input()},{basic:{titlej:'一行目\n二行目'}},signal(),()=>{}),/verification_failed/);
 assert.equal(port.log.includes('save'),false);
});
test('preflight leaves management open for institution selection and execution saves it before navigating away',async()=>{
 const port=new Fake();const base=await inspectAll(port,target,['management','purpose'],signal(),()=>{},true);
 assert.deepEqual(port.log,['open','menu','open']);assert.equal(port.page.documentId,'input-management');
 for(const f of port.page.fields.filter(f=>f.readOnly))f.value='その他';
 base.management=await port.read();port.log=[];
 await runAll(port,target,base,{purpose:{diseasej:'架空'},management:{i_fnamej:'架空'}},signal(),()=>{});
 assert.deepEqual(port.log.slice(0,4),['fill','confirm','save','menu']);
 assert.equal(port.page.phase,'menu');
});
test('changed institution selection after review stops before any mutation',async()=>{
 const port=new Fake();const base=await inspectAll(port,target,['management'],signal(),()=>{},true);
 port.page.fields.find(f=>f.readOnly)!.value='別の選択';port.log=[];
 await assert.rejects(runAll(port,target,base,{management:{i_fnamej:'架空'}},signal(),()=>{}));assert.deepEqual(port.log,[]);
});
