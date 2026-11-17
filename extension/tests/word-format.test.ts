import test from 'node:test';
import assert from 'node:assert/strict';
import {convertDocx} from '../src/docx';
import {parseConverted} from '../src/parser';
import {dom,docx,p,W} from './helpers';
dom();
const run=(s:string,yellow=false)=>`<w:r>${yellow?'<w:rPr><w:highlight w:val="yellow"/></w:rPr>':''}<w:t>${s}</w:t></w:r>`;
const para=(s:string,id=1,level=0)=>`<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr></w:pPr>${s}</w:p>`;
const numbers=(format='bullet',pattern='■',start=1,override='',extra='')=>`<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0">${extra}<w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${pattern}"/><w:suff w:val="space"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>${override}</w:num></w:numbering>`;
async function parse(edits:Record<string,string>,numbering='',styles=''){
 return parseConverted(await convertDocx(await docx(edits,{'word/numbering.xml':numbering||`<w:numbering xmlns:w="${W}"/>`,...(styles?{'word/styles.xml':styles}:{})})));
}
const get=(entries:ReturnType<typeof parseConverted>,name:string)=>entries.find(e=>e.field.name===name)!;
test('literal selected squares and split yellow runs match whole options',async()=>{
 const entries=await parse({'0:5:1':p('■日本/ Japan')+p('□北米/North America'),'1:3:1':`<w:p>${run('悪性',true)}${run('腫瘍',true)}${run('/Malignancy',true)}</w:p>`});
 assert.deepEqual(get(entries,'region').value,['01']);assert.equal(get(entries,'region').resolved,true);
 assert.equal(get(entries,'cancer').resolved,true);
});
test('Word numbering square is a selection, not lost HTML list decoration',async()=>{
 const entries=await parse({'0:5:1':para(run('日本/ Japan'))},numbers());
 assert.deepEqual(get(entries,'region').value,['01']);assert.equal(get(entries,'region').resolved,true);
});
test('yellow may select a default empty square bullet; no mark still needs review',async()=>{
 const entries=await parse({'0:5:1':para(run('日本',true)+run('/',true)+run(' Japan',true))},numbers('bullet','□'));
 assert.deepEqual(get(entries,'region').value,['01']);assert.equal(get(entries,'region').resolved,true);
 const blank=await parse({'0:5:1':para(run('日本/ Japan'))},numbers('bullet','□'));
 assert.equal(get(blank,'region').resolved,false);
});
test('partial highlight, conflicting radio choices and unknown symbol fonts stay manual',async()=>{
 const partial=await parse({'0:5:1':`<w:p>${run('日',true)}${run('本/ Japan')}</w:p>`});
 assert.equal(get(partial,'region').resolved,false);
 const changedLabel=await parse({'0:5:1':`<w:p>${run('日本',true)}${run('/Different option')}</w:p>`});
 assert.equal(get(changedLabel,'region').resolved,false);
 const conflict=await parse({'1:3:1':p('■悪性腫瘍/Malignancy')+`<w:p>${run('悪性腫瘍以外/Others',true)}</w:p>`});
 assert.equal(get(conflict,'cancer').resolved,false);
 const unknown=await parse({'0:5:1':para(run('日本/ Japan',true))},numbers('bullet','\uf06c'));
 assert.equal(get(unknown,'region').resolved,false);
});
test('unsupported earlier list items block later continuation in another field',async()=>{
 const entries=await parse({'7:4:1':para('<w:r><w:rPr><w:vanish/></w:rPr><w:t>架空A</w:t></w:r>'),'7:5:1':para(run('架空B'))},numbers('decimal','%1.'));
 assert.equal(get(entries,'incj').resolved,false);assert.equal(get(entries,'excj').resolved,false);
});
test('decimal list preserves start, override and continuation across cells',async()=>{
 const entries=await parse({'7:4:1':para(run('架空の基準A'))+para(run('架空の基準B')),'7:5:1':para(run('架空の基準C'))},numbers('decimal','(%1)',3));
 assert.equal(get(entries,'incj').value,'(3) 架空の基準A\n(4) 架空の基準B');
 assert.equal(get(entries,'excj').value,'(5) 架空の基準C');
 assert.equal(get(entries,'incj').resolved,true);
 const override=await parse({'7:4:1':para(run('架空の基準'))},numbers('decimal','%1.',1,'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride>'));
 assert.equal(get(override,'incj').value,'7. 架空の基準');
});
test('unsupported multilevel, missing definitions and inherited numbering stay manual',async()=>{
 for(const numbering of ['',numbers('aiueoFullWidth','%1')]){
  const entries=await parse({'7:4:1':para(run('架空の基準'))},numbering);
  assert.equal(get(entries,'incj').resolved,false);
 }
 const multi=await parse({'7:4:1':para(run('架空A'))+para(run('架空B'),1,1)},numbers('decimal','%1.'));
 assert.equal(get(multi,'incj').resolved,false);
 const inherited=await parse({'7:4:1':`<w:p><w:pPr><w:pStyle w:val="ListX"/></w:pPr>${run('架空')}</w:p>`},numbers(),`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="ListX"><w:name w:val="Body Text Indent"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style></w:styles>`);
 assert.equal(get(inherited,'incj').resolved,false);
});
test('explicit line breaks including w:cr and tabs are retained',async()=>{
 const entries=await parse({'7:4:1':`<w:p>${run('架空A')}<w:r><w:cr/></w:r>${run('架空B')}<w:r><w:br/></w:r>${run('架空C')}<w:r><w:tab/></w:r>${run('架空D')}</w:p>`});
 assert.equal(get(entries,'incj').value,'架空A\n架空B\n架空C\t架空D');assert.equal(get(entries,'incj').resolved,true);
});
test('independent list IDs restart and literal bullet prefixes are retained in free text',async()=>{
 const numbering=numbers('decimal','%1.',0).replace('</w:numbering>','<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
 const entries=await parse({'7:4:1':para(run('架空A')),'7:5:1':para(run('架空B'),2)},numbering);
 assert.equal(get(entries,'incj').value,'0. 架空A');assert.equal(get(entries,'excj').value,'0. 架空B');
 const bullet=await parse({'7:4:1':para(run('架空A'))},numbers('bullet','•').replace('<w:suff w:val="space"/>',''));
 assert.equal(get(bullet,'incj').value,'•\t架空A');assert.equal(get(bullet,'incj').resolved,true);
});
test('malformed supplemental XML is rejected rather than ignoring its definitions',async()=>{
 const converted=await convertDocx(await docx());converted.styles='<w:styles/>';
 assert.throws(()=>parseConverted(converted),/docx_parse_failed/);
});
test('hidden and special-font numbering markers cannot select an option',async()=>{
 for(const props of ['<w:rPr><w:vanish/></w:rPr>','<w:rPr><w:rFonts w:ascii="Wingdings"/></w:rPr>']){
  const es=await parse({'0:5:1':para(run('日本/ Japan'))},numbers().replace('</w:lvl>',props+'</w:lvl>'));
  assert.equal(get(es,'region').resolved,false);assert.deepEqual(get(es,'region').value,[]);
 }
});
test('hidden text or property revisions must not silently become submitted values',async()=>{
 const hidden=await parse({'0:5:1':`<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>■日本/ Japan</w:t></w:r></w:p>`});
 assert.equal(get(hidden,'region').resolved,false);
 await assert.rejects(parse({'7:4:1':`<w:p><w:pPr><w:pPrChange w:id="1"><w:pPr/></w:pPrChange></w:pPr>${run('架空')}</w:p>`}),/revision_or_embedded_content/);
});
