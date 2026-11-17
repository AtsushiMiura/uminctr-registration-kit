import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNew,createNew,type BrowserPort} from '../src/runner';
import {BASE,ENTRY,assertTarget} from '../src/policy';
import {input,menu,confirmed} from './helpers';
import type {NewTarget,Page} from '../src/model';
const target:NewTarget={tabId:1,newBasic:true,scientificTitle:'架空の検証試験'};
const signal=()=>new AbortController().signal;
const blank=():Page=>({...input(),identity:{},url:BASE+'ctr_ins_f1.cgi'});
class NewBrowser implements BrowserPort {
 page:Page={...menu(),url:ENTRY,phase:'unknown',identity:{}};log:string[]=[];bad=false;uncertain=false;wrongReceipt=false;
 async read(){return structuredClone(this.page);}
 async request(action:string,data:any){this.log.push(action);for(const f of this.page.fields)if(Object.hasOwn(data.patch,f.name))f.value=data.patch[f.name];return {page:await this.read()};}
 async navigate(action:string,data:any,_signal:AbortSignal){
  this.log.push(action);
  if(action==='open-new')this.page=blank();
  else if(action==='confirm'){
   this.page=confirmed(data.expected);
   if(this.bad)this.page.groups[0].paragraphs[0].text='別の内容';
  } else if(action==='save'){
   if(this.uncertain)throw new Error('uncertain');
   this.page=confirmed(data.expected,'saved');
  } else if(action==='menu'){
   this.page=menu();if(this.wrongReceipt)this.page.identity.scientificTitle='別の試験';
  } else throw new Error('unexpected action');
  return this.read();
 }
}
test('new entry opens blank form without saving, then binds receipt only after verified save',async()=>{
 const port=new NewBrowser();const base=await inspectNew(port,target,signal());assert.deepEqual(port.log,['open-new']);
 const bound=await createNew(port,target,base,{titlesj:target.scientificTitle,titlej:'架空の一般向け試験名'},signal());
 assert.deepEqual(bound,{tabId:1,scientificTitle:target.scientificTitle,receipt:'T000000001'});
 assert.deepEqual(port.log,['open-new','fill','confirm','save','menu']);assert.equal(port.page.phase,'menu');
});
test('receipt-less scope cannot operate existing trials or final pages; populated new form stops',async()=>{
 for(const page of [input(),menu(),{...blank(),heading:'UMIN-CTR データの最終確認'},{...blank(),identity:{receipt:'T000000001'}}])assert.throws(()=>assertTarget(page,target));
 const port=new NewBrowser();port.page=blank();port.page.fields[0].value='前回の入力';
 await assert.rejects(inspectNew(port,target,signal()),/new_form_not_empty/);assert.deepEqual(port.log,[]);
});
test('new confirmation mismatch, uncertain save, wrong issued identity stop without retry',async()=>{
 for(const kind of ['bad','uncertain','wrongReceipt'] as const){
  const port=new NewBrowser();port[kind]=true;const base=await inspectNew(port,target,signal());
  await assert.rejects(createNew(port,target,base,{titlesj:target.scientificTitle,titlej:'架空'},signal()));
  assert.equal(port.log.filter(x=>x==='save').length,kind==='bad'?0:1);
  assert.equal(port.log.filter(x=>x==='open-new').length,1);
 }
});
test('new execution rejects stale input and a source title different from target',async()=>{
 const port=new NewBrowser();const base=await inspectNew(port,target,signal());port.log=[];
 port.page.fields[0].value='手動変更';
 await assert.rejects(createNew(port,target,base,{titlesj:target.scientificTitle},signal()));assert.deepEqual(port.log,[]);
 port.page=blank();
 await assert.rejects(createNew(port,target,base,{titlesj:'別の試験'},signal()));assert.deepEqual(port.log,[]);
});
