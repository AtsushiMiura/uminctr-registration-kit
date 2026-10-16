import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, planPatch, confirmationIssues, valueDifferences, assertIdentity, createSession} from './umin_forms.mjs';
import {uminBytes, suggestAscii, validateText} from './umin_text.mjs';

const input = (id='progress') => ({...structuredClone(catalog.forms[id]), phase:'input', groups:[], identity:{receipt:'T000000001',scientificTitle:'Fictional test'},
  fields:catalog.forms[id].fields.map(f=>({...structuredClone(f),value:f.kind==='checkbox'?[]:''}))});

test('all six catalogs have unique field names and no case values',()=>{
  assert.equal(Object.keys(catalog.forms).length,6);
  assert.equal(Object.values(catalog.forms).reduce((n,f)=>n+f.fields.length,0),210);
  for(const form of Object.values(catalog.forms)) {
    assert.equal(new Set(form.fields.map(f=>f.name)).size,form.fields.length);
    assert(form.fields.every(f=>!Object.hasOwn(f,'value') && f.paragraph>=0 && f.section));
  }
});
test('unspecified date is empty in confirmation, not fabricated dashes',()=>{
  const p=input(); p.fields=p.fields.filter(f=>f.name.startsWith('enddt_'));
  const actual={groups:[{section:p.fields[0].section,heading:p.fields[0].heading,paragraphs:[{text:'',rows:[]}]}]};
  assert.deepEqual(confirmationIssues(p,actual),[]);
});
test('detects schema drift and invalid choices before any write',()=>{
  const p=input('purpose'); p.fields.find(f=>f.name==='object').options[1][1]='Changed label';
  assert(planPatch(p,'purpose',{object:'99',unmapped:'x'}).issues.some(i=>i.code==='options_changed'));
  assert(planPatch(p,'purpose',{object:'99'}).issues.some(i=>i.code==='unknown_option'));
  assert(planPatch(p,'purpose',{unmapped:'x'}).issues.some(i=>i.code==='unknown_field'));
});
test('partial patches preserve all unrelated fields and reject invalid dates',()=>{
  const p=input();
  const plan=planPatch(p,'progress',{prog:'01'});
  assert.deepEqual(plan.issues,[]); assert.equal(plan.changes.length,1);
  assert.equal(p.fields.find(f=>f.name==='prog').value,'');
  assert(planPatch(p,'progress',{prtdt_yyyy:'2027',prtdt_mm:'02',prtdt_dd:'29'}).issues.some(i=>i.code==='invalid_calendar_date'));
  assert(planPatch(p,'progress',{prtdt_yyyy:'2026'}).issues.some(i=>i.code==='specify_all_date_parts_including_blanks'));
});
test('detects external edits to untouched fields',()=>{
  const a=input('design'), b=structuredClone(a); b.fields.find(f=>f.name==='exc').value='1. External edit';
  assert.deepEqual(valueDifferences(a,b),[{name:'exc',code:'value_changed'}]);
});
test('wrong identity and final screen stop without a browser mutation',async()=>{
  assert.throws(()=>assertIdentity(input(),{receipt:'T000000002',scientificTitle:'Fictional test'}),/differs/);
  assert.throws(()=>assertIdentity({heading:'UMIN-CTR データの最終確認'},{}),/Final/);
  const page=input(); let writes=0;
  const session=createSession({url:async()=>`${catalog.origin}${catalog.practicePath}ctr_up_rec_f6.cgi`,playwright:{evaluate:async()=>page,expectNavigation:async()=>{writes++;}}}, {receipt:'T000000001',scientificTitle:'Fictional test'});
  await assert.rejects(session.fill('progress',{prog:'99'}),/unknown_option/);
  await assert.rejects(session.save(),/verified/);
  assert.equal(writes,0);
});
test('byte model counts full-width Japanese, ASCII, and newline',()=>{
  assert.equal(uminBytes('日本A\r\nB'),7);
  const field={name:'titlej',language:'日本語',tag:'textarea'};
  assert.deepEqual(validateText(field,'あ'.repeat(127)+'A').issues,[]);
  assert(validateText(field,'あ'.repeat(128)).issues.some(i=>i.code==='byte_limit_exceeded'&&i.excess===1));
});
test('rejects non-ASCII English, half-width kana, entities, numeric and markup errors',()=>{
  assert(validateText({name:'inc',language:'英語',tag:'textarea'},'Age ≥ 20').issues.some(i=>i.code==='ascii_required'));
  assert(validateText({name:'incj',language:'日本語',tag:'textarea'},'ﾃｽﾄ').issues.some(i=>i.code==='half_width_kana_not_allowed'));
  assert(validateText({name:'inc',language:'英語',tag:'textarea'},'A&nbsp;B').issues.some(i=>i.code==='html_entity_not_allowed'));
  assert(validateText({name:'partno',tag:'input'},'１００').issues.some(i=>i.code==='ascii_digits_required'));
  assert(validateText({name:'oucmes',tag:'textarea'},'<b>Value</b>').issues.some(i=>i.code==='html_not_allowed_in_outcome_measures'));
});
test('replacement is reviewable and never invents units or translations',()=>{
  const source='• Age ≥ ２０\nDose 5 μg−10 μg'; const result=suggestAscii(source);
  assert.equal(result.value,'- Age >= 20\nDose 5 μg-10 μg');
  assert.deepEqual(result.unresolved,['μ']); assert(result.replacements.length>0);
  assert.equal(source,'• Age ≥ ２０\nDose 5 μg−10 μg');
});
test('confirmation rejects lost numbering and swapped language values',()=>{
  const p=input('design'); p.fields=p.fields.filter(f=>['incj','inc'].includes(f.name));
  p.fields[0].value='1. 第一条件\n2. 第二条件'; p.fields[1].value='1. First\n2. Second';
  const group={heading:p.fields[0].heading,section:p.fields[0].section,paragraphs:[{text:'日本語 第一条件 第二条件',rows:[]},{text:'英語 1. First 2. Second',rows:[]}]};
  assert(confirmationIssues(p,{groups:[group]}).some(i=>i.name==='incj'));
});
