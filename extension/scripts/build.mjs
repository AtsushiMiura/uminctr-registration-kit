import {build} from 'esbuild';
import {mkdir, copyFile, readdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const production of [false,true]){
 const outdir=production?'dist-production':'dist';
 await mkdir(`${root}${outdir}`,{recursive:true});
 for(const name of await readdir(`${root}static`))await copyFile(`${root}static/${name}`,`${root}${outdir}/${name}`);
 await copyFile(`${root}../LICENSE`,`${root}${outdir}/LICENSE.txt`);
 if(production){
  const manifest=JSON.parse(await readFile(`${root}${outdir}/manifest.json`,'utf8'));
  manifest.name='UMIN-CTR 転記補助（本番・登録前）';
  manifest.description='定型DOCXを端末内で読み込み、UMIN本番の正式登録前の下書きへ転記・照合します。正式登録や登録済み試験の更新は行いません。';
  manifest.action.default_title='UMIN-CTR 転記補助（本番・登録前）を開く';
  await writeFile(`${root}${outdir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
  const html=await readFile(`${root}${outdir}/panel.html`,'utf8');
  await writeFile(`${root}${outdir}/panel.html`,html.replace('UMIN-CTR 転記補助 1.0 / 練習環境','UMIN-CTR 転記補助 1.0 / 本番・登録前'));
 }
 await build({absWorkingDir:root,entryPoints:['src/panel.ts','src/parse-worker.ts','src/background.ts','src/content.ts'],outdir,bundle:true,platform:'browser',format:'iife',target:'chrome116',legalComments:'eof',logLevel:'info',define:{__UMIN_PRODUCTION__:String(production)}});
}
const pkg=JSON.parse(await readFile(`${root}package.json`,'utf8'));
const notices=['UMIN-CTR extension third-party licenses\n'];
const lock=JSON.parse(await readFile(`${root}package-lock.json`,'utf8'));
for(const [path,meta] of Object.entries(lock.packages)){
 if(!path||meta.dev)continue;
 const candidates=(await readdir(`${root}${path}`)).filter(f=>/^licen[sc]e(?:\.|$)/i.test(f));
 for(const f of candidates)notices.push(`\n${path} ${meta.version}\n${await readFile(`${root}${path}/${f}`,'utf8')}`);
}
await writeFile(`${root}dist/THIRD_PARTY_NOTICES.txt`,notices.join('\n'));
await writeFile(`${root}dist-production/THIRD_PARTY_NOTICES.txt`,notices.join('\n'));
console.log(`Built ${pkg.name} ${pkg.version} (separate practice and production-draft builds).`);
