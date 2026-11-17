import {parseConverted, forms} from './parser';
import {suggestNames,reviewCount} from './review';
import {renderPerson} from './person-editor';
import type {Converted} from './docx';
const MAX_FILE = 10 * 1024 * 1024;
import {Stop, fail, equal, formNames as names, type Entry, type Patch, type Target, type NewTarget} from './model';
import {Transport} from './transport';
import {inspectAll, runAll, inspectNew, createNew, type Baselines} from './runner';
import {planPatch} from '../../skills/fill-umin-registration-draft/scripts/umin_forms.mjs';
import {BASE,ENVIRONMENT_LABEL,PRODUCTION,assertTarget,assertInput} from './policy';
import {selectOtherInstitution,type InstitutionKind} from './institution';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const messages: Record<string,string> = {
 no_forms:'入力対象のフォームを選んでください。',file_size:'ファイルサイズが上限を超えています（圧縮前10MB・展開後40MB）。',not_docx:'DOCXを読み込んでください。Wordで「名前を付けて保存」→「Word文書（.docx）」を選びます。',
 zip_unsupported:'このDOCXの圧縮形式には対応していません。',active_content:'マクロ・埋め込みファイル・外部エンティティを含む文書には対応していません。',
 docx_parse_failed:'原稿を解析できません。Wordで保存し直し、対応テンプレートか確認してください。',
 revision_or_embedded_content:'変更履歴または埋め込みコンテンツがあります。原稿を確認して確定してから読み込んでください。',
 template_changed:'対応テンプレート（Version 1.2.0）の項目・表構造と一致しません。',unmapped_content:'「主な結果入力日」に転記先が定義されていない記載があります。内容を確認してから再読込してください。',
 outside_scope:`この拡張は${ENVIRONMENT_LABEL}専用です。対応する案内・新規基本情報・登録途中のフォーム選択画面を開いてください。登録済み試験の更新には対応していません。`,
 new_form_not_empty:'新規画面に入力済みの値があります。重複作成を防ぐため停止しました。保存済みなら、開始位置で「基本情報入力済み：目的以降を入力」を選んでください。',
 new_attempted:'新規作成を一度実行しています。自動で作り直しません。入力中の臨床試験一覧で保存状態を確認し、保存済みなら開始位置で「基本情報入力済み：目的以降を入力」を選んでください。',
 basic_mismatch:'入力済みの基本情報と原稿が一致しません。対象試験と原稿を確認してください。',
 permission_required:'UMINへのアクセス許可が必要です。対象のUMINタブを開き、もう一度「事前照合」を押してChromeの確認画面で許可してください。原稿と確認済みの入力は保持しています。',
 wrong_trial_or_final:'対象試験が一致しないか、操作対象外の画面です。操作を停止しました。',
 start_at_menu:'UMINのフォーム選択画面から開始してください。',verification_failed:'入力制約・画面構造・値の照合に失敗しました。再送せず、画面の状態を確認してください。',
 stale_page:'事前照合後に画面が変わりました。もう一度事前照合してください。',wrong_phase:'想定した画面へ進みませんでした。画面上のエラーと保存状態を確認してください。',
 timeout_no_retry:'応答を確認できませんでした。自動再送はしません。保存状態を確認してから事前照合をやり直してください。',
 connection_lost:'画面との接続が切れました。保存状態を確認してから事前照合をやり直してください。',
 operation_failed:'操作を停止しました。画面の状態を確認してください。',unexpected_action:'保存先または画面の操作構造が想定と異なります。',
 ambiguous_button:'操作するボタンを特定できません。',unresolved:'未確定の項目があります。',missing_title:'科学的試験名（日本語）を原稿で確定してください。',
 readonly_field:'機関選択はUMIN画面で行ってください。',preflight_required:'事前照合をやり直してください。',
 institution_manual:'機関を自動選択できませんでした。開いている管理情報画面で機関を選び、もう一度事前照合してください。自動で開き直すことはしません。',
 server_busy_page:'UMINが「Server is busy」と応答したため、処理を停止しました。原稿と確認済みの入力は保持しています。画面更新によるフォーム再送信はせず、「4. 一括入力」の停止後の再開手順に沿って、一覧から対象の下書きを開き直してください。',
 server_busy:'UMINが「Server is busy」と応答したため、処理を停止しました。自動再送はしません。原稿と確認済みの入力は保持しています。少し時間を置き、機関選択ウインドウを閉じ、管理情報画面の「フォームの選択」で戻ってから、事前照合をやり直してください。',
 institution_popup_missing:'機関選択ウインドウを検出できませんでした。Chromeでポップアップがブロックされている場合は、center6.umin.ac.jp だけを許可してください。開いている機関選択ウインドウがあれば閉じ、管理情報画面の「フォームの選択」で戻ってから、もう一度事前照合してください。原稿の再読込は不要です。',
 institution_popup_incomplete:'機関選択ウインドウの読み込みを5秒以内に確認できませんでした。自動で開き直しません。ウインドウの状態を確認し、管理情報画面で機関を手動選択して、もう一度事前照合してください。',
 institution_popup_ambiguous:'対象の機関選択ウインドウを特定できませんでした。自動選択は停止しました。管理情報画面で機関を手動選択して、もう一度事前照合してください。',
 institution_selection_unverified:'機関選択ウインドウは開きましたが、「その他」の選択・反映を確認できませんでした。自動再操作はしません。管理情報画面で選択結果を確認し、必要なら機関を手動選択して、もう一度事前照合してください。',
 institution_conflict:'UMINに別の機関が選択されています。「機関の選び方」を手動選択に切り替えるか、UMIN画面で選択内容を確認してください。自動では上書きしません。',
};
const validationMessages: Record<string,string> = {
 wrong_form_or_phase:'想定した入力画面ではありません。',
 missing_field:'必要な入力欄が見つかりません。',
 structure_changed:'入力欄の構造が想定と異なります。',
 options_changed:'選択肢が想定と異なります。',
 new_field:'未対応の入力欄があります。',
 patch_must_be_object:'転記データの形式が正しくありません。',
 unknown_field:'転記先の入力欄が見つかりません。',
 wrong_value_type:'入力値の形式が正しくありません。',
 unknown_option:'選択肢にない値が指定されています。',
 disabled_field:'この入力欄は操作できない状態です。',
 use_institution_picker:'UMIN画面で機関を選択してください。',
 specify_all_date_parts_including_blanks:'日付は年・月・日をまとめて指定してください。空欄にする部分も対象に含めてください。',
 invalid_calendar_date:'存在しない日付です。年・月・日を確認してください。',
 ascii_required:'使用できない文字が含まれています。半角英数字・半角記号を使ってください。',
 control_character:'タブなどの制御文字が含まれています。',
 single_line_field:'改行できない入力欄に改行が含まれています。',
 half_width_kana_not_allowed:'半角カナは使用できません。',
 character_requires_review:'使用できるか確認が必要な文字が含まれています。',
 ascii_digits_required:'半角数字で入力してください。',
 html_entity_not_allowed:'文字をHTMLの文字参照で表した記載は使用できません。',
 html_not_allowed_in_outcome_measures:'評価項目にHTMLタグは使用できません。',
 markup_requires_visual_verification:'HTMLタグのような記載があります。原稿と照合してください。',
 byte_limit_exceeded:'入力できる文字量の上限を超えています。',
 dom_maxlength_exceeded:'入力欄の文字数上限を超えています。',
 combined_name_byte_limit_exceeded:'姓・名・ミドルネームを合わせた文字量が上限を超えています。',
 byte_limit_not_documented:'この項目の文字量の上限は資料に記載されていません。',
};
function validationText(form:string, issue:{code:string;name?:string}) {
  const labels=(issue.name||'').split(',').filter(Boolean).map(name=>{
    const field=entries.find(e=>e.form===form&&(e.field.name===name||e.field.name===`${name}_yyyy`))?.field;
    return field?`${field.heading.split('/')[0]} ${field.language} ${field.rowLabel}`.trim():name;
  });
  return `${names[form]}${labels.length?' / '+labels.join('・'):''}：${validationMessages[issue.code]||`入力内容を確認できませんでした（${issue.code}）。`}`;
}
let mode: 'new' | 'resume' = 'resume';
let newAttempted = false;
let selectedForms = forms.filter(id=>id!=='basic');
let entries: Entry[] = [], transport: Transport | undefined, target: Target | NewTarget | undefined;
let baseline: Baselines = {}, patches: Record<string,Patch> = {}, busy = false, controller = new AbortController();
let parseWorker: Worker | undefined;
let pendingInstitutions: {target:Target;baseline:Baselines} | undefined;
const institutionModes:Record<string,'other'|'manual'>={sponsor_nm:'other',fund_nm:'other'};
const progress = (text: string) => {$('status').textContent = text;};
function errorText(error: unknown) {return error instanceof DOMException && error.name === 'AbortError' ? '停止しました。保存済みの内容は取り消されません。' : messages[error instanceof Stop ? error.code : 'operation_failed'] || messages.operation_failed;}
function invalidate() {baseline = {}; patches = {}; $('review').replaceChildren(); $('run').setAttribute('disabled','');}
function updateButtons() {$<HTMLButtonElement>('preflight').disabled = busy || !entries.length; $<HTMLButtonElement>('file').disabled = busy; $<HTMLButtonElement>('stop').disabled = !busy; $('editor').toggleAttribute('inert',busy); $('form-scope').toggleAttribute('inert',busy); $<HTMLSelectElement>('mode').disabled=busy;}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {const n = document.createElement(tag); n.textContent = text; n.className = className; return n;}
function render() {
  const editor = $('editor'); editor.replaceChildren();
  for (const form of mode==='resume'?['basic',...selectedForms]:selectedForms) {
    const group = node('details'); group.open = form === 'basic';
    const relevant = entries.filter(e => e.form === form);
    const summary = node('summary', `${names[form]}${mode==='resume'&&form==='basic'?'（照合のみ）':''}（要確認 ${reviewCount(relevant)}件）`); group.append(summary);
    for (const prefix of ['i','w']) {
      const person=relevant.filter(e=>new RegExp(`^${prefix}_(?:fname|mname|name)j?$`).test(e.field.name));
      if(person.length===6)group.append(renderPerson(person,prefix,()=>{invalidate();summary.textContent=`${names[form]}（要確認 ${reviewCount(relevant)}件）`;}));
    }
    for (const e of relevant) {
      if(/^[iw]_(?:fname|mname|name)j?$/.test(e.field.name))continue;
      const box = node('section', '', 'field');
      box.append(node('h3', `${e.field.heading.split('/')[0]} ${e.field.language} ${e.field.rowLabel}`));
      box.append(node('p', e.field.section.split('/')[0], 'muted'));
      if (e.issue && !Object.hasOwn(institutionModes,e.field.name)) box.append(node('p',e.issue,'issue'));
      const source = node('details'); source.append(node('summary','原稿の該当箇所'),node('pre',e.source || '（空欄）')); box.append(source);
      const controlId = `field-${e.field.name}`;
      const changed = () => {e.resolved = true; invalidate(); summary.textContent = `${names[form]}（要確認 ${reviewCount(relevant)}件）`;};
      if(Object.hasOwn(institutionModes,e.field.name)){
        const select=node('select');select.id=controlId;select.setAttribute('aria-label',`${e.field.section.split('/')[0]}：機関の選び方`);
        for(const [value,label] of [['other','その他を自動選択（原稿の機関名を転記）'],['manual','UMIN画面で選択・現在の機関を維持']]){const o=node('option',label);o.value=value;select.append(o);}
        select.value=institutionModes[e.field.name];select.onchange=()=>{institutionModes[e.field.name]=select.value as 'other'|'manual';changed();};box.append(select);
        box.append(node('p','「その他」は未選択の場合だけ自動選択します。すでに別の機関があれば停止します。機関名は下の「機関選択不可の場合」欄で確認してください。','muted'));
        box.append(node('p','初回はChromeで center6.umin.ac.jp のポップアップを許可してください。設定方法は「3. 対象と差分を照合」にあります。','muted'));
        group.append(box);continue;
      } else if (e.field.options) {
        const select = node('select'); select.id = controlId; select.setAttribute('aria-label',e.field.heading);
        select.multiple = e.field.kind === 'checkbox';
        if (!select.multiple) {const placeholder = node('option','選択してください'); placeholder.value='__unresolved'; placeholder.disabled=true; select.append(placeholder);}
        for (const [value,label] of e.field.options) {const option = node('option',label); option.value=value; select.append(option);}
        for (const option of select.options) option.selected = e.resolved || e.value!=='' && !Array.isArray(e.value) ? Array.isArray(e.value) ? e.value.includes(option.value) : e.value===option.value : option.value==='__unresolved';
        select.onchange=()=>{e.value=select.multiple?[...select.selectedOptions].map(o=>o.value).sort():select.value; changed();}; box.append(select);
      } else {
        const input = e.field.kind==='text' && e.field.tag==='textarea' ? node('textarea') : node('input');
        input.id=controlId; input.setAttribute('aria-label',e.field.heading); input.value = String(e.value);
        if (e.field.readOnly) input.disabled=true;
        input.oninput=()=>{e.value=input.value; changed();}; box.append(input);
      }
      const keepLabel=node('label'); const keep=node('input'); keep.type='checkbox'; keep.checked=e.keep;
      keep.onchange=()=>{e.keep=keep.checked; (box.querySelector('#'+controlId) as HTMLInputElement | HTMLSelectElement).disabled=keep.checked || e.field.readOnly; changed();};
      if (e.field.readOnly) keep.disabled=true;
      keepLabel.append(keep,document.createTextNode('現在のUMINの値を維持する')); if(!(mode==='resume'&&form==='basic'))box.append(keepLabel);
      if (!e.resolved) {
        const confirm=node('button','この内容で確定'); confirm.type='button';
        confirm.onclick=()=>{if (e.field.options && !Array.isArray(e.value) && e.value === '' && !e.keep) return; changed(); confirm.disabled=true; confirm.textContent='確定済み';}; box.append(confirm);
      }
      group.append(box);
    }
    editor.append(group);
  }
}
async function parseFile(file: File): Promise<Converted> {
  if (!/\.docx$/i.test(file.name)) fail('not_docx');
  if (file.size > MAX_FILE) fail('file_size');
  const bytes=await file.arrayBuffer();
  return new Promise((resolve,reject)=>{
    const worker = new Worker('parse-worker.js'); parseWorker=worker;
    const timer=setTimeout(()=>finish(new Stop('docx_parse_failed')),15000);
    const finish=(error?:Error,result?:Converted)=>{clearTimeout(timer); worker.terminate(); parseWorker=undefined; error?reject(error):resolve(result!);};
    worker.onmessage=({data})=>data.ok?finish(undefined,data.result):finish(new Stop(data.code));
    worker.onerror=()=>finish(new Stop('docx_parse_failed'));
    controller.signal.addEventListener('abort',()=>finish(new DOMException('Aborted','AbortError')),{once:true});
    worker.postMessage(bytes,[bytes]);
  });
}
async function job(action:()=>Promise<void>) {
  if (busy) return; busy=true; controller=new AbortController(); updateButtons();
  try {await action();} catch(error) {invalidate(); progress(errorText(error));}
  finally {busy=false; updateButtons();}
}
$<HTMLInputElement>('file').onchange=()=>void job(async()=>{
  transport?.disconnect(); transport=undefined; target=undefined; pendingInstitutions=undefined; entries=[]; invalidate(); $('editor').replaceChildren();
  const file=$<HTMLInputElement>('file').files?.[0]; if(!file)return;
  progress('原稿を端末内で解析しています…');
  try {entries=parseConverted(await parseFile(file)); suggestNames(entries);for(const e of entries)if(Object.hasOwn(institutionModes,e.field.name)){institutionModes[e.field.name]='other';e.resolved=true;}} finally {$<HTMLInputElement>('file').value='';}
  render(); progress(`読み込みました。要確認 ${reviewCount(entries)}件を確定してください。`);
});
async function preflight() { await job(async()=>{
  invalidate();
  if(!selectedForms.length)fail('no_forms');
  if(entries.some(e=>(e.form==='basic'||selectedForms.includes(e.form))&&!e.resolved))fail('unresolved');
  const title=entries.find(e=>e.field.name==='titlesj');
  if(!title || title.keep || typeof title.value!=='string' || !title.value.trim())fail('missing_title');
  // Bind once to the tab selected by the user; later tab switches never change the destination.
  if(!transport) {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(tab.id===undefined)fail('outside_scope');
    transport=new Transport(tab.id);
  }
  if (mode==='new') {
    if(newAttempted)fail('new_attempted');
    target={newBasic:true,tabId:transport.tabId,scientificTitle:title.value};
    baseline={basic:await inspectNew(transport,target,controller.signal)};
  } else {
    const page=await transport.read();
    let inspected:Baselines;
    if(pendingInstitutions && page.phase==='menu') {
      assertTarget(page,pendingInstitutions.target);
      pendingInstitutions=undefined; // A deliberate return discarded unsaved selections; inspect again.
    }
    if(pendingInstitutions) {
      target=pendingInstitutions.target;
      if(target.scientificTitle!==title.value)fail('wrong_trial_or_final');
      assertTarget(page,target);assertInput(page,'management');
      if(page.documentId!==pendingInstitutions.baseline.management.documentId)fail('stale_page');
      inspected={...pendingInstitutions.baseline,management:page};
      if(selectedForms.some(id=>!inspected[id]))fail('preflight_required');
    } else {
      if(page.phase!=='menu' || !page.identity.receipt)fail('start_at_menu');
      if(target && ('newBasic' in target || target.receipt!==page.identity.receipt || target.scientificTitle!==title.value))fail('wrong_trial_or_final');
      target={tabId:transport.tabId,receipt:page.identity.receipt,scientificTitle:title.value};
      inspected=await inspectAll(transport,target,['basic',...selectedForms],controller.signal,progress,true);
      if(inspected.management)pendingInstitutions={target,baseline:inspected};
    }
    // Existing basic information is inspected, never overwritten during resume.
    for(const field of inspected.basic.fields) {
      const source=entries.find(e=>e.form==='basic'&&e.field.name===field.name);
      if(!source?.resolved || !equal(source.value,field.value))fail('basic_mismatch');
    }
    if(inspected.management){
      for(const [name,kind] of [['sponsor_nm','sponsors'],['fund_nm','funds']] as const){
        if(institutionModes[name]!=='other')continue;
        progress('管理情報等：機関の「その他」を選択・照合中');
        inspected.management=await selectOtherInstitution(transport,target,inspected.management,kind as InstitutionKind,controller.signal);
        pendingInstitutions={target,baseline:inspected};
      }
    }
    baseline=inspected;
  }
  const review=$('review'); review.replaceChildren(node('h2','一括入力前の確認'),node('p',`環境：${ENVIRONMENT_LABEL} ／ 対象：${target.receipt || '新規作成（受付番号は保存後に発行）'} / ${target.scientificTitle}`));
  let errors=0, changes=0;
  for (const form of selectedForms) {
    const patch:Patch={};
    for(const e of entries.filter(e=>e.form===form&&!e.keep))patch[e.field.name]=e.value;
    patches[form]=patch;
    const plan=planPatch(baseline[form],form,patch);
    for (const issue of plan.issues) {errors++; review.append(node('p',validationText(form,issue),'issue'));}
    for (const warning of plan.warnings || []) review.append(node('p',validationText(form,warning),'muted'));
    for(const field of baseline[form].fields) {
      const desired=Object.hasOwn(patch,field.name)?patch[field.name]:field.value;
      if(field.readOnly&&!String(field.value).trim()){errors++;review.append(node('p',`${names[form]} / ${field.heading}：開いているUMIN管理情報画面で機関を選び、画面を移動せず「事前照合」をもう一度押してください。`,'issue'));}
      if(!Object.hasOwn(patch,field.name)) {
        const kept=node('details'); kept.append(node('summary',`${names[form]} / ${field.heading} ${field.language}（現在値を維持）`),node('pre',String(field.value)));review.append(kept);
      }
      if(equal(desired,field.value))continue;
      changes++;
      const d=node('details'); d.append(node('summary',`${names[form]} / ${field.heading} ${field.language}`),node('pre',`現在：${JSON.stringify(field.value)}\n転記後：${JSON.stringify(desired)}`));review.append(d);
    }
  }
  if(errors){progress(`${errors}件の問題があります。原稿・入力値・UMINの機関選択を確認してください。`);return;}
  const label=node('label'), approved=node('input');approved.type='checkbox';
  label.append(approved,document.createTextNode(`対象試験と${changes}項目の差分・上書きを確認しました`));review.append(label);
  approved.onchange=()=>{$<HTMLButtonElement>('run').disabled=!approved.checked;};
  progress('事前照合が完了しました。差分を確認して実行してください。');
});}
$('preflight').onclick=async()=>{
  if(busy)return;
  // A side-panel button does not itself grant activeTab. Request the declared
  // UMIN origin for either entry mode, directly within this user gesture.
  try {if(!await chrome.permissions.request({origins:['https://center6.umin.ac.jp/*']})){invalidate();progress(messages.permission_required);return;}}
  catch {invalidate();progress(messages.permission_required);return;}
  await preflight();
};
$('run').onclick=()=>void job(async()=>{
  if(!transport||!target||!Object.keys(baseline).length)fail('preflight_required');
  $('run').setAttribute('disabled','');
  const before=baseline, patch=patches; baseline={};patches={};pendingInstitutions=undefined;$('review').replaceChildren();
  if(mode==='new') {
    if(newAttempted || !('newBasic' in target))fail('new_attempted');
    newAttempted=true; // Consume even if navigation/save outcome is ambiguous.
    progress('基本情報を新規保存し、受付番号を確認しています…');
    target=await createNew(transport,target,before.basic,patch.basic,controller.signal);
    mode='resume'; $<HTMLSelectElement>('mode').value='resume'; setStage();
    progress(`基本情報を保存しました（${target.receipt}）。同じ原稿の目的以降を確認し、事前照合してください。`);
  } else {
    if('newBasic' in target)fail('preflight_required');
    await runAll(transport,target,before,patch,controller.signal,progress);
  }
});
$('stop').onclick=()=>{controller.abort();parseWorker?.terminate();transport?.disconnect();};
$('reset').onclick=()=>{controller.abort();parseWorker?.terminate();transport?.disconnect();location.reload();};
window.addEventListener('pagehide',()=>{controller.abort();parseWorker?.terminate();transport?.disconnect();});
$('scope').textContent=`${ENVIRONMENT_LABEL}専用：${BASE} ／ 最終確認・正式登録・登録済み試験の更新は行いません。${PRODUCTION?'本番の下書きに保存されます。':''}`;
function setStage() {
  selectedForms=mode==='new'?['basic']:forms.filter(id=>id!=='basic');
  $('form-scope').replaceChildren();
  for(const form of selectedForms) {
    const label=node('label'), check=node('input');check.type='checkbox';check.checked=true;check.disabled=mode==='new';
    check.onchange=()=>{selectedForms=forms.filter(id=>id!=='basic'&&(id===form?check.checked:selectedForms.includes(id)));invalidate();if(entries.length)render();};
    label.append(check,document.createTextNode(names[form]));$('form-scope').append(label);
  }
  $('run').textContent=mode==='new'?'基本情報を新規保存':'目的以降を一括入力';
  $('stage-note').textContent=mode==='new'?'段階1：新規登録の案内ページまたは空の基本情報画面から開始します。保存後は同じ原稿で段階2へ進みます。':'段階2：登録途中の対象試験のフォーム選択画面から開始します。基本情報を原稿と照合し、目的以降だけを入力します。';
  invalidate(); if(entries.length)render();
}
$<HTMLSelectElement>('mode').onchange=()=>{
  mode=$<HTMLSelectElement>('mode').value as 'new'|'resume';
  transport?.disconnect();transport=undefined;target=undefined;pendingInstitutions=undefined;setStage();
};
setStage();updateButtons();
