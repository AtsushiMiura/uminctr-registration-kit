import test from 'node:test';
import assert from 'node:assert/strict';
import {convertDocx, checkZip} from '../src/docx';
import {parseConverted} from '../src/parser';
import {dom,docx,p,W} from './helpers';
const mark=(s:string)=>`<w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>${s}</w:t></w:r></w:p>`;
dom();
async function parse(edits:Record<string,string>={},extras:Record<string,string>={}){return parseConverted(await convertDocx(await docx(edits,extras)));}
test('deterministic template mapping preserves text and marks exact choices',async()=>{
 const entries=await parse({'0:1:1':p('架空の検証原稿')+p('2行目'),'0:1:2':p('Fictional text'),'0:5:1':mark('日本/ Japan'),'1:3:1':mark('悪性腫瘍/Malignancy')});
 assert.equal(entries.length,210);
 assert.equal(entries.find(e=>e.field.name==='titlej')!.value,'架空の検証原稿\n2行目');
 assert.equal(entries.find(e=>e.field.name==='title')!.value,'Fictional text');
 assert.deepEqual(entries.find(e=>e.field.name==='region')!.value,['01']);
 assert.equal(entries.find(e=>e.field.name==='cancer')!.resolved,true);
 assert.equal(entries.find(e=>e.field.name==='i_fnamej')!.resolved,false);
 assert.equal(entries.find(e=>e.field.name==='i_zip')!.resolved,false);
});
test('unmarked, partial and conflicting selections need human confirmation',async()=>{
 const entries=await parse({'1:3:1':mark('悪性腫瘍/Malignancy')+mark('悪性腫瘍以外/Others'),'0:5:1':mark('日')});
 for(const name of ['cancer','region','genomeYN'])assert.equal(entries.find(e=>e.field.name===name)!.resolved,false);
});
test('checkbox controls and inherited highlighting cannot silently become a selection',async()=>{
 const entries=await parse({'0:5:1':`<w:sdt><w:sdtPr/><w:sdtContent>${mark('日本/ Japan')}</w:sdtContent></w:sdt>`});
 assert.equal(entries.find(e=>e.field.name==='region')!.resolved,false);
 const converted=await convertDocx(await docx({'0:5:1':mark('日本/ Japan')}));
 converted.styles=`<w:styles xmlns:w="${W}"><w:highlight w:val="yellow"/></w:styles>`;
 assert.equal(parseConverted(converted).find(e=>e.field.name==='region')!.resolved,false);
});
test('does not divide names or invent dates; empty template date is empty',async()=>{
 const entries=await parse({'8:1:1':p('架空 太郎'),'18:1:1':p('  年  月  日'),'21:2:1':p('2026年11月17日'),'21:3:1':p('2026年11月日')});
 assert.equal(entries.find(e=>e.field.name==='i_fnamej')!.value,'');
 assert.equal(entries.find(e=>e.field.name==='i_fnamej')!.source,'架空 太郎');
 assert.equal(entries.find(e=>e.field.name==='discldt_yyyy')!.value,'');
 assert.equal(entries.find(e=>e.field.name==='prtdt_mm')!.value,'11');
 assert.equal(entries.find(e=>e.field.name==='ethics_dt_mm')!.resolved,false);
});
test('rejects changed headers, unmapped populated rows and revisions',async()=>{
 await assert.rejects(parse({'0:1:0':p('別の項目')}),/template_changed/);
 await assert.rejects(parse({'20:3:1':p('2026年11月17日')}),/unmapped_content/);
 await assert.rejects(parse({'0:1:1':`<w:del>${p('削除済みの架空文')}</w:del>`}),/revision_or_embedded_content/);
});
test('macro, embedded payload, DTD and non-DOCX files are rejected',async()=>{
 for(const part of ['word/vbaProject.bin','word/embeddings/oleObject1.bin'])await assert.rejects(convertDocx(await docx({}, {[part]:'test'})),/active_content/);
 await assert.rejects(convertDocx(await docx({}, {'word/custom.xml':'<!DOCTYPE x><x/>'})),/active_content/);
 assert.throws(()=>checkZip(new ArrayBuffer(30)),/not_docx/);
});
test('markup-looking source stays text and never becomes live document HTML',async()=>{
 const entries=await parse({'0:1:1':p('<img src="https://invalid.example/" onerror="alert(1)">')});
 assert.equal(entries.find(e=>e.field.name==='titlej')!.value,'<img src="https://invalid.example/" onerror="alert(1)">');
 assert.equal(document.querySelectorAll('img,script,table').length,0);
});
test('automatic list numbering is not silently renumbered by Mammoth',async()=>{
 const entries=await parse({'7:4:1':'<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="42"/></w:numPr></w:pPr><w:r><w:t>架空の適格基準</w:t></w:r></w:p>'});
 const field=entries.find(e=>e.field.name==='incj')!;
 assert.equal(field.resolved,false);assert.equal(field.value,'');assert.match(field.issue,/自動番号/);
});
