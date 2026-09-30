import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'dist');
const required=['index.html','selector.css','navigation.css','style.css','design.css','roster-polish.css','sound.js','online.js','game.js','players.js','_headers','football/index.html','basketball/index.html','basketball/theme.css','basketball/game.js','basketball/players.js'];
function files(at){return readdirSync(at,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(resolve(at,f.name)):[relative(dir,resolve(at,f.name)).split(sep).join('/')]);}
for(const name of required)if(!statSync(resolve(dir,name)).isFile())throw Error(`Missing file: ${name}`);
for(const name of files(dir)) {
 if(!required.includes(name))throw Error(`Unexpected asset: ${name}`);
 const source=readFileSync(resolve(dir,name),'utf8');
 if(/localhost|127\.0\.0\.1|BEGIN (?:RSA )?PRIVATE KEY/.test(source))throw Error(`Development URL or private key in ${name}`);
 if(name.endsWith('.js'))execFileSync(process.execPath,['--check',resolve(dir,name)]);
 if(name.endsWith('.html'))for(const [,url] of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if(/^(?:data:|https?:|#)/.test(url))continue;
  let path=resolve(url.startsWith('/')?dir:dirname(resolve(dir,name)),'.'+(url.startsWith('/')?url:'/'+url.split(/[?#]/)[0]));
  if(path!==dir&&!path.startsWith(dir+sep))throw Error(`Invalid asset: ${url}`);
  if(statSync(path).isDirectory())path=resolve(path,'index.html');
  if(!statSync(path).isFile())throw Error(`Missing link: ${name} → ${url}`);
 }
}
const bytes=files(dir).reduce((n,f)=>n+statSync(resolve(dir,f)).size,0);
console.log(`Multi-sport build verified: ${required.length} files, ${bytes} bytes.`);
