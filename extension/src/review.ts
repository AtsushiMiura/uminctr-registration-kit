import type {Entry} from './model';
export const MANUAL_ISSUE = '原稿を確認して入力してください（自動分割・補完はしません）';
export function ageParts(source: string, bound: 'low' | 'up') {
  const match = source.match(/^\s*([0-9]+)[ \u3000]*(歳|ヶ月|か月|月|週|日)[ \u3000]*(以上|より上|以下|未満)\s*$/u);
  if (!match) return;
  const [,number,unit,limit] = match;
  const limits = bound === 'low' ? {'以上':'01','より上':'02'} : {'以下':'01','未満':'02'};
  if (!(limit in limits)) return;
  return {number,unit:({'歳':'01','ヶ月':'02','か月':'02','月':'02','週':'03','日':'05'} as Record<string,string>)[unit],limit:limits[limit as keyof typeof limits]!};
}
// Candidates are displayed for human confirmation; these rules never resolve a name.
export function nameCandidate(source: string, language: 'ja' | 'en') {
  const pattern = language === 'ja'
    ? /^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]+)[ \u3000]+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]+)$/u
    : /^([A-Za-z]+(?:[-'][A-Za-z]+)*)[ ]+([A-Za-z]+(?:[-'][A-Za-z]+)*)$/;
  const match = source.trim().match(pattern);
  if (!match) return;
  return language==='ja'?{family:match[1],given:match[2]}:{family:match[2],given:match[1]};
}
export function suggestNames(entries: Entry[]) {
  for (const prefix of ['i','w']) for (const suffix of ['j','']) {
    const group=['fname','mname','name'].map(part=>entries.find(e=>e.field.name===`${prefix}_${part}${suffix}`));
    if(group.some(e=>!e || e.resolved || e.issue!==MANUAL_ISSUE || e.value!==''))continue;
    const candidate=nameCandidate(group[0]!.source,suffix?'ja':'en');
    if(!candidate)continue;
    group[0]!.value=candidate.given;group[2]!.value=candidate.family;
    // resolved remains false for all three parts, including the empty middle name.
  }
}

export function reviewCount(entries: Entry[]) {
  const names=/^[iw]_(?:fname|mname|name)j?$/;
  return entries.filter(e=>!e.resolved&&!names.test(e.field.name)).length +
    ['i','w'].filter(prefix=>entries.some(e=>!e.resolved&&names.test(e.field.name)&&e.field.name.startsWith(prefix+'_'))).length;
}
