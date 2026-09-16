import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'dist');
// The checked-in dist directory is the authored static site; no compilation is needed.
for(const f of ['index.html','style.css','game.js','players.js']) {
  if(!statSync(resolve(dir,f)).isFile())throw Error(`Missing production file: ${f}`);
}
for(const f of ['game.js','players.js'])execFileSync(process.execPath,['--check',resolve(dir,f)]);
const html=readFileSync(resolve(dir,'index.html'),'utf8');
for(const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if(/^(?:data:|https?:|#)/.test(url))continue;
  const path=resolve(dir,url.split(/[?#]/)[0]);
  if(!path.startsWith(dir)||!statSync(path))throw Error(`Invalid asset: ${url}`);
}
for(const f of readdirSync(dir)) {
  if(!['index.html','style.css','game.js','players.js','_headers'].includes(f))throw Error(`Unexpected deployment asset: ${f}`);
  if(/localhost|127\.0\.0\.1|BEGIN (?:RSA )?PRIVATE KEY/.test(readFileSync(resolve(dir,f),'utf8')))throw Error(`Development URL or private key in ${f}`);
}
const bytes=readdirSync(dir).reduce((n,f)=>n+statSync(resolve(dir,f)).size,0);
console.log(`Production build verified: dist/ (${bytes} bytes), no dependencies or compilation.`);
