import mammoth from 'mammoth';
import JSZip from 'jszip';
import {fail} from './model';
export const MAX_FILE = 10 * 1024 * 1024;
const MAX_EXPANDED = 40 * 1024 * 1024;
// Check central-directory metadata before decompression; ZIP64/encryption are not supported.
export function checkZip(bytes: ArrayBuffer) {
  if (bytes.byteLength > MAX_FILE || bytes.byteLength < 22) fail('file_size');
  const view = new DataView(bytes);
  let end = -1;
  for (let p = bytes.byteLength - 22; p >= Math.max(0, bytes.byteLength - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.byteLength) {end = p; break;}
  }
  if (end < 0) fail('not_docx');
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  if (!count || count > 1000 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail('zip_unsupported');
  let p = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || view.getUint32(p, true) !== 0x02014b50) fail('zip_unsupported');
    if (view.getUint16(p + 8, true) & 1) fail('zip_unsupported');
    total += view.getUint32(p + 24, true);
    if (total > MAX_EXPANDED) fail('file_size');
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  if (p !== end) fail('zip_unsupported');
}
export interface Converted {html: string; xml: string; styles: string; numbering?: string; warnings: number}
export async function convertDocx(bytes: ArrayBuffer): Promise<Converted> {
  checkZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  if (names.some(n => /vba|activex|embeddings/i.test(n))) fail('active_content');
  const xmlFile = zip.file('word/document.xml'), contentFile = zip.file('[Content_Types].xml');
  if (!xmlFile || !contentFile) fail('not_docx');
  const content = await contentFile.async('string');
  if (/macroEnabled|vbaProject|activeX/i.test(content)) fail('active_content');
  const xml = await xmlFile.async('string');
  const styles = await zip.file('word/styles.xml')?.async('string') || '';
  const numbering = await zip.file('word/numbering.xml')?.async('string') || '';
  // Reject DTDs in every XML part, not only the main document.
  for (const name of names.filter(n => /\.(xml|rels)$/i.test(n))) {
    if (/<!DOCTYPE|<!ENTITY/i.test(await zip.file(name)!.async('string'))) fail('active_content');
  }
  const input = typeof window === 'undefined' && typeof Buffer !== 'undefined'
    ? {buffer: Buffer.from(bytes)} : {arrayBuffer: bytes};
  const result = await mammoth.convertToHtml(input, {
    externalFileAccess: false, includeEmbeddedStyleMap: false, ignoreEmptyParagraphs: false,
    styleMap: ["highlight[color='yellow'] => mark.selection:fresh", ...['header', 'HTML Preformatted', 'Body Text Indent', 'Body Text Indent 2', 'Body Text Indent 3', '標準1'].map(name => `p[style-name='${name}'] => p:fresh`)],
    convertImage: mammoth.images.imgElement(() => Promise.resolve({src: ''})),
  });
  // The parser reads w:cr directly from OOXML, retaining the line break Mammoth omits.
  const handledWarnings = ['An unrecognised element was ignored: w:tblPrEx', 'An unrecognised element was ignored: w:cr'];
  return {html: result.value, xml, styles, numbering, warnings: result.messages.filter(m => m.type !== 'warning' || !handledWarnings.includes(m.message)).length};
}
