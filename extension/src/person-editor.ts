import type {Entry} from './model';
const node = <K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
export function renderPerson(person: Entry[], prefix: string, onChange:()=>void) {
  const box=node('section','','field');
  box.append(node('h3',prefix==='i'?'責任研究者の氏名（日英まとめて確認）':'問い合わせ担当者の氏名（日英まとめて確認）'));
  box.append(node('p','氏名の区切りが明確な場合は、日本語を「姓 名」、英語を「名 姓」の順として候補を表示します。原文と照合し、姓と名が逆の場合や複合姓などは修正してください。','issue'));
  const confirm=node('button',person.every(e=>e.resolved)?'氏名は確定済み':'この人物の氏名をまとめて確定');confirm.type='button';confirm.disabled=person.every(e=>e.resolved);
  for(const suffix of ['j','']) {
    const source=person.find(e=>e.field.name===`${prefix}_fname${suffix}`)!;
    box.append(node('p',suffix?'日本語の原文':'英語の原文'),node('pre',source.source||'（空欄）'));
    const row=node('div','','name-parts');
    for(const [part,label] of [['name','姓'],['fname','名'],['mname','ミドルネーム']]) {
      const entry=person.find(e=>e.field.name===`${prefix}_${part}${suffix}`)!;
      const wrap=node('label',label),input=node('input');input.value=String(entry.value);input.disabled=entry.keep;
      input.setAttribute('aria-label',`${prefix==='i'?'責任研究者':'問い合わせ担当'} ${suffix?'日本語':'英語'} ${label}`);
      input.oninput=()=>{entry.value=input.value;for(const e of person)e.resolved=false;onChange();confirm.disabled=false;confirm.textContent='この人物の氏名をまとめて確定';};
      wrap.append(input);row.append(wrap);
    }
    box.append(row);
  }
  const keep=node('input');keep.type='checkbox';keep.checked=person.every(e=>e.keep);
  const keepLabel=node('label');keepLabel.append(keep,document.createTextNode('この人物の氏名は現在のUMINの値を維持する'));box.append(keepLabel);
  keep.onchange=()=>{for(const e of person){e.keep=keep.checked;e.resolved=false;}for(const input of box.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])'))input.disabled=keep.checked;onChange();confirm.disabled=false;confirm.textContent='この人物の氏名をまとめて確定';};
  confirm.onclick=()=>{for(const e of person)e.resolved=true;onChange();confirm.disabled=true;confirm.textContent='氏名は確定済み';};
  box.append(confirm);return box;
}
