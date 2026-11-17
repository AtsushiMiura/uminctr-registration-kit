import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import template from '../src/template.json';
import {catalog} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {BASE} from '../src/policy';
import type {Page} from '../src/model';
export const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const p=(s:string)=>`<w:p><w:r><w:t xml:space="preserve">${escape(s)}</w:t></w:r></w:p>`;
export function dom() {
 const browser=new JSDOM('<!doctype html><html><body></body></html>');
 Object.assign(globalThis,{document:browser.window.document,DOMParser:browser.window.DOMParser,Element:browser.window.Element,Node:browser.window.Node});
 return browser;
}
export async function docx(edits:Record<string,string>={}, extras:Record<string,string>={}) {
 const rows=template.tables.map(t=>t.map(row=>Array.from({length:row.cells},(_,i)=>p(i===0?row.label:''))));
 for(const [coordinate,xml] of Object.entries(edits)){
  const [t,r,c]=coordinate.split(':').map(Number);rows[t][r][c]=xml;
 }
 const body=rows.map(t=>`<w:tbl>${t.map(row=>`<w:tr>${row.map(cell=>`<w:tc>${cell}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`).join('');
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${p('UMIN-CTR登録用フォーム Version 1.2.0')}${body}</w:body></w:document>`);
 for(const [name,value] of Object.entries(extras))zip.file(name,value);
 return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
}
export function input(form='basic'):Page {
 const base=(catalog.forms as any)[form];
 return {...structuredClone(base),phase:'input',identity:{receipt:'T000000001',scientificTitle:'架空の検証試験'},groups:[],url:BASE+base.actions[0],documentId:'input-'+form,
 fields:base.fields.map((f:any)=>({...structuredClone(f),value:f.kind==='checkbox'?[]:'',maxLength:null}))};
}
export function menu():Page {return {heading:'UMIN-CTR フォームの選択とデータの確認',phase:'menu',identity:input().identity,groups:[],fields:[],buttons:[],actions:[],url:BASE+'ctr_menu_form.cgi',documentId:'menu'};}
export function confirmed(expected:Page,phase='confirm'):Page {
 const groups:any[]=[];
 for(const f of expected.fields){
  let g=groups.find(g=>g.section===f.section&&g.heading===f.heading);
  if(!g){g={section:f.section,heading:f.heading,paragraphs:[]};groups.push(g);}
  let label=f.kind==='checkbox'?f.options!.filter(o=>(f.value as string[]).includes(o[0])).map(o=>o[1]).join(' '):f.value===''?'':f.options?.find(o=>o[0]===f.value)?.[1]||f.value;
  if(/_(yyyy|mm|dd)$/.test(f.name)&&f.value)label=String(f.value)+(f.name.endsWith('_yyyy')?'年':f.name.endsWith('_mm')?'月':'日');
  const paragraph=g.paragraphs[f.paragraph] ||= {text:f.language,rawText:f.language+'\n',rows:[]};
  paragraph.text+=' '+label;paragraph.rawText+=String(label);
  if(f.rowLabel)paragraph.rows.push([f.rowLabel,f.value]);
 }
 return {...structuredClone(expected),phase,fields:[],groups,documentId:phase};
}
