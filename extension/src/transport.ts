import {assertUrl, NEW_LINK} from './policy';
import {Stop, type Page} from './model';
export class Transport {
  private port?: chrome.runtime.Port;
  private serial = 0;
  private pending = new Map<number, {resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>}>();
  constructor(readonly tabId: number) {}
  disconnect() {this.port?.disconnect(); this.port = undefined; this.rejectPending();}
  private rejectPending() {for (const job of this.pending.values()) {clearTimeout(job.timer); job.reject(new Stop('connection_lost'));} this.pending.clear();}
  async connect() {
    if (this.port) return;
    const tab = await chrome.tabs.get(this.tabId);
    if (!tab.url) throw new Stop('permission_required');
    assertUrl(tab.url);
    await chrome.scripting.executeScript({target:{tabId:this.tabId}, files:['content.js'], world:'ISOLATED'});
    const port = chrome.tabs.connect(this.tabId, {name:'umin-ctr-v1', frameId:0}); this.port = port;
    port.onDisconnect.addListener(() => {void chrome.runtime.lastError; if (this.port === port) {this.port = undefined; this.rejectPending();}});
    port.onMessage.addListener(message => {
      const job = this.pending.get(message.id); if (!job) return;
      clearTimeout(job.timer); this.pending.delete(message.id);
      if (message.ok) job.resolve(message); else job.reject(new Stop(message.code || 'operation_failed'));
    });
  }
  async request(action: string, data: object = {}): Promise<any> {
    await this.connect();
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {this.pending.delete(id); reject(new Stop('timeout_no_retry'));}, 15000);
      this.pending.set(id, {resolve, reject, timer});
      this.port!.postMessage({id, action, ...data});
    });
  }
  async read(): Promise<Page> {return (await this.request('read')).page;}
  async navigate(action: string, data: {before: Page} & Record<string, unknown>, signal: AbortSignal): Promise<Page> {
    signal.throwIfAborted();
    await this.request(action, data); // A mutation is never retried, even on a timeout/disconnect.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        const page = await this.read();
        if (page.documentId !== data.before.documentId) return page;
      } catch (error) {
        if (error instanceof Stop && error.code === 'server_busy_page') throw error;
        if (error instanceof Stop && error.code === 'outside_scope') {
          // The observed entry link redirects via upload.umin.ac.jp; never inject there.
          const tab = action === 'open-new' ? await chrome.tabs.get(this.tabId) : undefined;
          if (tab?.url !== NEW_LINK) throw error;
        }
      }
    }
    throw new Stop('timeout_no_retry');
  }
}
