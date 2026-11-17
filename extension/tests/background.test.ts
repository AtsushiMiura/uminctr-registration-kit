import test from 'node:test';
import assert from 'node:assert/strict';
test('toolbar action opens the panel for the clicked tab without toggling it closed',async()=>{
 let clicked:((tab:{id?:number})=>void)|undefined;const opened:number[]=[];
 Object.assign(globalThis,{chrome:{action:{onClicked:{addListener:(fn:typeof clicked)=>{clicked=fn;}}},sidePanel:{setPanelBehavior:async()=>{},open:async({tabId}:{tabId:number})=>{opened.push(tabId);}}}});
 await import('../src/background');assert.equal(typeof clicked,'function');
 clicked!({id:7});clicked!({id:7});clicked!({});
 assert.deepEqual(opened,[7,7]);
});
