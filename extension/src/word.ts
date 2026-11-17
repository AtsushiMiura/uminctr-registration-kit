// Narrow OOXML supplement to Mammoth: explicit runs and level-zero list definitions.
// Unrecognised numbering is never replaced with Mammoth's default 1, 2, 3 sequence.
import {fail} from './model';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (e: Element, name: string) => [...e.children].filter(c => c.namespaceURI === W && c.localName === name);
const descendants = (e: Element | Document, name: string) => [...e.getElementsByTagNameNS(W, name)];
const val = (e?: Element, name = 'val') => e?.getAttributeNS(W, name) ?? '';
const child = (e: Element | undefined, name: string) => e && children(e, name)[0];
const parse = (s: string) => new DOMParser().parseFromString(s || `<w:empty xmlns:w="${W}"/>`, 'application/xml');
export interface WordParagraph {text: string; highlights: string[]; marker: string; suffix: string; issue: string}
const NUMBERING_ISSUE = '自動番号・箇条書きの定義を確定できません。Wordの番号・チェックを確認してください';
export function readWord(xml: Document, numbering = '', styles = ''): Map<Element, WordParagraph> {
  const result = new Map<Element, WordParagraph>(), numbers = parse(numbering), styleDoc = parse(styles);
  if (numbers.querySelector('parsererror') || styleDoc.querySelector('parsererror')) fail('docx_parse_failed');
  const definitions = descendants(numbers, 'num'), abstracts = descendants(numbers, 'abstractNum');
  const styleDefs = descendants(styleDoc, 'style');
  function inherited(p: Element, tags: string[]): boolean {
    const ids = [val(child(child(p, 'pPr'), 'pStyle')), ...descendants(p, 'rStyle').map(s => val(s))];
    // Defaults apply even without an explicit style reference.
    if (descendants(styleDoc, 'docDefaults').some(d => tags.some(t => descendants(d, t).length))) return true;
    ids.push(...styleDefs.filter(s => ['1','true'].includes(val(s,'default'))).map(s => val(s,'styleId')));
    const seen = new Set<string>();
    for (let id of ids) while (id && !seen.has(id)) {
      seen.add(id);
      const style = styleDefs.find(s => val(s, 'styleId') === id);
      if (!style) break;
      if (tags.some(t => descendants(style, t).length)) return true;
      id = val(child(style, 'basedOn'));
    }
    return false;
  }
  const paragraphs = descendants(xml, 'p');
  const numPr = (p: Element) => child(child(p, 'pPr'), 'numPr');
  // A higher level can alter a shared counter; do not guess a subsequent level-zero value.
  const complexIds = new Set(paragraphs.filter(p => val(child(numPr(p), 'ilvl')) && val(child(numPr(p), 'ilvl')) !== '0').map(p => val(child(numPr(p), 'numId'))));
  for (const pr of descendants(styleDoc,'numPr')) complexIds.add(val(child(pr,'numId')));
  const counters = new Map<string, number>();
  for (const p of paragraphs) {
    const item: WordParagraph = {text:'', highlights:[], marker:'', suffix:'', issue:''};
    result.set(p, item);
    if (inherited(p, ['numPr','highlight','vanish','webHidden','caps','smallCaps'])) item.issue = 'スタイル由来の番号・強調・表示設定を原稿と照合してください';
    let highlighted = '';
    const flush = () => {if (highlighted) item.highlights.push(highlighted); highlighted = '';};
    function append(s: string, yellow: boolean) {item.text += s; if (yellow) highlighted += s; else flush();}
    function walk(e: Element, yellow = false) {
      if (e.namespaceURI !== W) {item.issue = '未対応の文字・表示設定があります'; return;}
      if (e.localName === 'r') {
        const properties = child(e, 'rPr');
        const highlight = val(child(properties, 'highlight'));
        if (properties && ['vanish','webHidden','caps','smallCaps','rtl'].some(t => descendants(properties, t).length)) item.issue = '非表示などの文字設定を原稿と照合してください';
        if (highlight && !['yellow','none'].includes(highlight)) item.issue = '黄色以外の強調を原稿と照合してください';
        for (const c of [...e.children]) if (c.localName !== 'rPr') walk(c, highlight === 'yellow');
      } else if (e.localName === 't') append(e.textContent || '', yellow);
      else if (['br','cr'].includes(e.localName)) {
        if (val(e,'type') && val(e,'type') !== 'textWrapping') item.issue = '改ページ・段区切りを原稿と照合してください';
        append('\n', yellow);
      } else if (e.localName === 'tab') append('\t', yellow);
      else if (e.localName === 'noBreakHyphen') append('\u2011', yellow);
      else if (e.localName === 'softHyphen') append('\u00ad', yellow);
      else if (['p','hyperlink'].includes(e.localName)) {for (const c of [...e.children]) walk(c, yellow);}
      else if (!['pPr','bookmarkStart','bookmarkEnd','proofErr','lastRenderedPageBreak','commentRangeStart','commentRangeEnd'].includes(e.localName)) item.issue = '未対応の文字・表示設定があります';
    }
    walk(p); flush();
    const pr = numPr(p);
    if (!pr) continue;
    const id = val(child(pr,'numId'));
    if (id === '0') continue;
    const nums = definitions.filter(n => val(n,'numId') === id);
    const abs = abstracts.filter(n => val(n,'abstractNumId') === val(child(nums[0],'abstractNumId')));
    const override = nums[0] && children(nums[0],'lvlOverride').filter(n => val(n,'ilvl') === '0');
    const levels = abs[0] && children(abs[0],'lvl').filter(n => val(n,'ilvl') === '0');
    const lvl = override?.[0] && child(override[0],'lvl') || levels?.[0];
    const hasRestart = abs[0] && [...abs[0].attributes].some(a => /restart/i.test(a.localName) && !['0','false'].includes(a.value));
    if (!id || complexIds.has(id) || nums.length !== 1 || abs.length !== 1 || levels?.length !== 1 || (override?.length || 0) > 1 || !lvl || val(lvl,'ilvl') !== '0' || hasRestart || ['numStyleLink','styleLink'].some(t => descendants(abs[0],t).length) || descendants(lvl,'lvlRestart').length) {item.issue = NUMBERING_ISSUE; continue;}
    const format = val(child(lvl,'numFmt')), pattern = val(child(lvl,'lvlText'));
    const suffix = val(child(lvl,'suff')) || 'tab';
    const symbolFont = descendants(lvl,'rFonts').some(f => [...f.attributes].some(a => /Wingdings|Webdings|Symbol/i.test(a.value)));
    const hiddenMarker = ['vanish','webHidden','specVanish'].some(t => descendants(lvl,t).length);
    if (!['tab','space','nothing'].includes(suffix) || ['1','true','on'].includes(val(child(lvl,'lvlText'),'null')) || symbolFont || hiddenMarker) {item.issue = NUMBERING_ISSUE; continue;}
    item.suffix = {tab:'\t',space:' ',nothing:''}[suffix]!;
    if (format === 'bullet') {
      if (!/^[□■☐☑☒✓✔•◦●○▪▫]$/u.test(pattern)) item.issue = NUMBERING_ISSUE;
      else item.marker = pattern;
    } else if (format === 'decimal' && /^[^%\d]*%1[^%\d]*$/.test(pattern) && pattern.length <= 32) {
      const start = val(child(override?.[0],'startOverride')) || val(child(lvl,'start'));
      if (!/^\d{1,8}$/.test(start)) {item.issue = NUMBERING_ISSUE; continue;}
      const count = counters.has(id) ? counters.get(id)! + 1 : Number(start);
      counters.set(id,count); item.marker = pattern.replace('%1',String(count));
    } else item.issue = NUMBERING_ISSUE;
  }
  // An unsupported earlier item can change continuation in later cells of the same list.
  const tainted = new Set(paragraphs.filter(p => result.get(p)!.issue && numPr(p)).map(p => val(child(numPr(p),'numId'))).filter(id => id && id !== '0'));
  for (const p of paragraphs) if (tainted.has(val(child(numPr(p),'numId')))) result.get(p)!.issue = NUMBERING_ISSUE;
  return result;
}
export function wordCell(cell: Element, paragraphs: Map<Element, WordParagraph>): {text: string; issue: string; paragraphs: WordParagraph[]} {
  const ps = children(cell,'p').map(p => paragraphs.get(p)!);
  const structural = [...cell.children].some(c => c.namespaceURI !== W || !['p','tcPr'].includes(c.localName));
  return {text: ps.map(p => p.marker + p.suffix + p.text).join('\n').replace(/^\n+|\n+$/g,''), issue: structural ? '未対応のセル内構造があります' : ps.find(p => p.issue)?.issue || '', paragraphs: ps};
}
