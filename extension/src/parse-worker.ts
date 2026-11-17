import {convertDocx} from './docx';
import {Stop} from './model';
self.onmessage = async ({data}: MessageEvent<ArrayBuffer>) => {
  try {self.postMessage({ok: true, result: await convertDocx(data)});}
  catch (error) {self.postMessage({ok: false, code: error instanceof Stop ? error.code : 'docx_parse_failed'});}
};
