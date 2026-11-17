import test from 'node:test';
import assert from 'node:assert/strict';
import {Transport} from '../src/transport';
import {assertUrl} from '../src/policy';
import {Stop, type Page} from '../src/model';

test('unavailable tab URL stops with a permission explanation before injection',async()=>{
 let injected=false;
 Object.assign(globalThis,{chrome:{tabs:{get:async()=>({id:1})},scripting:{executeScript:async()=>{injected=true;}}}});
 await assert.rejects(new Transport(1).read(),/permission_required/);
 assert.equal(injected,false);
});

test('malformed or unrelated URLs stop as outside scope',()=>{
 for(const url of ['', 'invalid', 'https://example.invalid/']) {
  assert.throws(()=>assertUrl(url),/outside_scope/);
 }
});
test('Busy after navigation stops immediately without retrying the request or polling again',async()=>{
 for(const action of ['open','confirm','save','menu']){
  const calls:string[]=[];
  class BusyTransport extends Transport {
   async request(name:string){calls.push(name);if(name==='read')throw new Stop('server_busy_page');return {ok:true};}
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),650);
  try {
   await assert.rejects(new BusyTransport(1).navigate(action,{before:{documentId:'before'} as Page},controller.signal),/server_busy_page/);
   assert.deepEqual(calls,[action,'read']);
  } finally {clearTimeout(timer);}
 }
});
