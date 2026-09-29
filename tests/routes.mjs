import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4188'},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error(`Server exited ${code}`)));child.stderr.once('data',s=>reject(Error(String(s))));});
 for(const [path,title] of [['/','Choose Your Game'],['/football','Football Edition'],['/football/','Football Edition'],['/basketball','Basketball Edition'],['/basketball/','Basketball Edition']]){
  for(let repeat=0;repeat<2;repeat++){const r=await fetch('http://127.0.0.1:4188'+path);assert.equal(r.status,200);assert((await r.text()).includes(title));}
 }
 for(const path of ['/style.css','/navigation.css','/selector.css','/sound.js','/game.js','/players.js','/basketball/game.js','/basketball/players.js','/basketball/theme.css']){const r=await fetch('http://127.0.0.1:4188'+path);assert.equal(r.status,200);assert(r.headers.get('content-type').includes(path.endsWith('.js')?'javascript':'css'));}
 assert.equal((await fetch('http://127.0.0.1:4188/not-a-route')).status,404);
 assert.equal((await fetch('http://127.0.0.1:4188/..%2fpackage.json')).status,404);
 console.log('PASS local direct routes, refresh, slash variants, assets, unknown paths and traversal rejection.');
}finally{child.kill();}
