import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

test('resume preflight requests UMIN access and stops on denial without losing the panel',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../static/panel.html',import.meta.url),'utf8'));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document});
 let requested:unknown;
 Object.assign(globalThis,{chrome:{permissions:{request:async(value:unknown)=>{requested=value;return false;}},tabs:{query:async()=>{throw new Error('must not read tabs after denial');}}}});
 await import('../src/panel');
 const button=document.getElementById('preflight') as HTMLButtonElement;
 // Exercise the user-gesture handler; parsing is unrelated to permission denial.
 await button.onclick!.call(button,new dom.window.MouseEvent('click') as unknown as PointerEvent);
 assert.deepEqual(requested,{origins:['https://center6.umin.ac.jp/*']});
 assert.match(document.getElementById('status')!.textContent!,/アクセス許可/);
 assert.equal((document.getElementById('mode') as HTMLSelectElement).value,'resume');
 dom.window.close();
});
