export type Value = string | string[];
export type Patch = Record<string, Value>;
export const formNames: Record<string,string> = {basic:'基本情報',purpose:'目的',design:'試験デザイン',management:'管理情報等',results:'結果等',progress:'進捗等'};
export interface Field {
  name: string; kind: string; tag: string; heading: string; section: string; language: string;
  paragraph: number; rowLabel: string; count: number; readOnly: boolean; disabled: boolean;
  options?: string[][]; datePart?: string; maxLength?: number | null; value: Value;
}
export interface Page {
  heading: string; identity: {receipt?: string; scientificTitle?: string}; phase: string;
  fields: Field[]; groups: any[]; buttons: {label: string; name: string; type: string}[];
  actions: string[]; url: string; documentId: string;
}
export interface Target {receipt: string; scientificTitle: string; tabId: number}
export interface NewTarget {newBasic: true; scientificTitle: string; tabId: number; receipt?: never}
export type OperationTarget = Target | NewTarget;
export interface Entry {form: string; field: Field; value: Value; source: string; issue: string; resolved: boolean; keep: boolean}
export class Stop extends Error {constructor(public code: string) {super(code);}}
export function fail(code: string): never {throw new Stop(code);}
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const normalized = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
