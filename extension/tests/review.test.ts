import test from 'node:test';
import assert from 'node:assert/strict';
import {ageParts,nameCandidate,suggestNames,reviewCount} from '../src/review';
import {renderPerson} from '../src/person-editor';
import {parseConverted} from '../src/parser';
import {convertDocx} from '../src/docx';
import {dom,docx,p,W} from './helpers';
dom();
const parse=async(edits:Record<string,string>)=>parseConverted(await convertDocx(await docx(edits)));
test('explicit age values retain units and inclusive/exclusive bounds; ambiguity is not resolved',async()=>{
 assert.deepEqual(ageParts('20歳以上','low'),{number:'20',unit:'01',limit:'01'});
 assert.deepEqual(ageParts('6ヶ月未満','up'),{number:'6',unit:'02',limit:'02'});
 for(const source of ['20','20歳前後','20〜30歳','20歳以下'])assert.equal(ageParts(source,'low'),undefined);
 const entries=await parse({'7:1:1':p('20歳以上'),'7:2:1':p('64歳以下')});
 for(const e of entries.filter(e=>/^age/.test(e.field.name)))assert.equal(e.resolved,true);
 const ambiguous=await parse({'7:1:1':p('20')});
 const unit=ambiguous.find(e=>e.field.name==='agelowu')!;
 assert.equal(unit.value,'01');assert.equal(unit.resolved,false);
 const hidden=await parse({'7:1:1':`<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>20歳以上</w:t></w:r></w:p>`});
 assert.equal(hidden.find(e=>e.field.name==='agelowu')!.resolved,false);
});
test('two-token names produce candidates only; unsplit, compound and multiline names remain manual',()=>{
 assert.deepEqual(nameCandidate('架空　太郎','ja'),{family:'架空',given:'太郎'});
 assert.deepEqual(nameCandidate('Taro Kakuu','en'),{family:'Kakuu',given:'Taro'});
 for(const source of ['架空太郎','姓: 架空 名: 太郎','架空\n太郎'])assert.equal(nameCandidate(source,'ja'),undefined);
 for(const source of ['Taro Middle Kakuu','Kakuu, Taro','Taro\nKakuu'])assert.equal(nameCandidate(source,'en'),undefined);
});
test('one person needs one explicit confirmation, and subsequent edits invalidate the whole name',async()=>{
 const entries=await parse({'8:1:1':p('架空 太郎'),'8:1:2':p('Taro Kakuu')});suggestNames(entries);
 const person=entries.filter(e=>/^i_(fname|mname|name)j?$/.test(e.field.name));
 assert.equal(person.every(e=>!e.resolved),true);assert.equal(reviewCount(person),1);
 assert.equal(person.find(e=>e.field.name==='i_fnamej')!.value,'太郎');
 let changes=0;const ui=renderPerson(person,'i',()=>changes++);document.body.append(ui);
 ui.querySelector('button')!.click();assert.equal(person.every(e=>e.resolved),true);assert.equal(reviewCount(person),0);
 const field=ui.querySelector<HTMLInputElement>('input[aria-label="責任研究者 日本語 姓"]')!;
 field.value='別姓';field.dispatchEvent(new document.defaultView!.Event('input'));
 assert.equal(person.every(e=>!e.resolved),true);assert.equal(ui.querySelector('button')!.disabled,false);assert.equal(changes,2);
 ui.remove();
});
test('name suggestions never replace edited or unsupported values',async()=>{
 const entries=await parse({'8:1:1':p('架空 太郎')});
 const given=entries.find(e=>e.field.name==='i_fnamej')!;given.value='編集済み';suggestNames(entries);assert.equal(given.value,'編集済み');
 given.value='';given.issue='書式を完全に読み取れません';suggestNames(entries);assert.equal(given.value,'');
});
