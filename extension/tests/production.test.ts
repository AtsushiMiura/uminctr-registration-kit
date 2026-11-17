import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {input,menu,confirmed} from './helpers';
const built=await build({stdin:{contents:"export * from './src/policy'; export * from './src/runner';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',define:{__UMIN_PRODUCTION__:'true'}});
const prod=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text+'\n//# sourceURL=production-test-bundle.mjs').toString('base64'));
const base='https://center6.umin.ac.jp/cgi-bin/ctr/';
const adapt=(page:any)=>({...page,url:page.url.replace('/ctr_test/','/ctr/'),identity:page.identity.receipt?{...page.identity,receipt:'R000000001'}:{}});
test('production build admits only its draft paths and excludes practice, registered updates and final pages',()=>{
 assert.equal(prod.BASE,base);
 for(const file of ['ctr_ins_f1.cgi','ctr_menu_form.cgi','ctr_up_rec_f1.cgi','ctr_up_rec_f6.cgi'])prod.assertUrl(base+file);
 for(const url of [base.replace('/ctr/','/ctr_test/')+'ctr_menu_form.cgi',base+'ctr_up_reg_f1.cgi',base+'ctr_menu_form_reg.cgi',base+'ctr_final.cgi',base+'nested/ctr_menu_form.cgi','https://example.invalid/'])assert.throws(()=>prod.assertUrl(url),/outside_scope/);
 assert.throws(()=>prod.assertAction('../ctr_test/ctr_up_rec_f1.cgi','ctr_up_rec_f1.cgi',base),/unexpected_action/);
});
test('production entry follows the two observed links and then requires an empty basic form',async()=>{
 let page={...adapt(menu()),url:'https://www.umin.ac.jp/ctr/index-j.htm',identity:{},phase:'unknown'};
 const log:string[]=[];
 const port={read:async()=>page,navigate:async()=>{log.push(page.url);page=log.length===1?{...page,url:'https://www.umin.ac.jp/ctr/new-registration.htm'}:{...adapt(input()),url:base+'ctr_ins_f1.cgi',identity:{}};return page;}};
 await prod.inspectNew(port,{newBasic:true,tabId:1,scientificTitle:'架空の検証試験'},new AbortController().signal);
 assert.deepEqual(log,['https://www.umin.ac.jp/ctr/index-j.htm','https://www.umin.ac.jp/ctr/new-registration.htm']);
});
test('production new save binds only an R receipt and stops at the draft menu',async()=>{
 for(const prefix of ['R','T']){
  let page={...adapt(input()),identity:{},url:base+'ctr_ins_f1.cgi'};const baseline=structuredClone(page),log:string[]=[];
  const target={newBasic:true,tabId:1,scientificTitle:'架空の検証試験'};
  const port={read:async()=>structuredClone(page),request:async(action:string,data:any)=>{log.push(action);for(const f of page.fields)if(Object.hasOwn(data.patch,f.name))f.value=data.patch[f.name];return{page:structuredClone(page)};},navigate:async(action:string,data:any)=>{log.push(action);page=action==='menu'?{...adapt(menu()),identity:{...menu().identity,receipt:prefix+'000000001'}}:confirmed(data.expected,action==='save'?'saved':'confirm');return structuredClone(page);}};
  const result=prod.createNew(port,target,baseline,{titlesj:target.scientificTitle},new AbortController().signal);
  if(prefix==='R')assert.equal((await result).receipt,'R000000001');else await assert.rejects(result,/wrong_phase|wrong_trial_or_final/);
  assert.deepEqual(log,['fill','confirm','save','menu']);
 }
});
test('production target rejects a practice receipt and an already registered route before changes',()=>{
 const page=adapt(input()),target={tabId:1,receipt:'R000000001',scientificTitle:page.identity.scientificTitle};
 prod.assertTarget(page,target);
 assert.throws(()=>prod.assertTarget({...page,url:base+'ctr_up_reg_f1.cgi'},target));
 assert.throws(()=>prod.assertTarget({...page,identity:{...page.identity,receipt:'T000000001'}},{...target,receipt:'T000000001'}));
});
