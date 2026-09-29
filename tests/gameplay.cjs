const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const baseline=JSON.parse(fs.readFileSync('tests/football-baseline.json','utf8'));
for(const [file,hash] of Object.entries(baseline))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/'+file)).digest('hex'),hash,`Football changed: ${file}`);
function engine(sport,manual=false){
 const timers=[];
 const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},scrollIntoView(){},showModal(){},close(){}});return nodes.get(id);}
 const sb={document:{getElementById:node,querySelector:node,querySelectorAll:()=>[]},window:{matchMedia:()=>({matches:!manual}),scrollTo(){}},setTimeout:manual?(f=>{timers.push(f);return timers.length;}):(f=>setTimeout(f,0)),clearTimeout,setInterval,clearInterval,console};vm.createContext(sb);
 for(const f of ['players.js','game.js']){if(f==='game.js')vm.runInContext(fs.readFileSync('dist/sound.js','utf8'),sb);vm.runInContext(fs.readFileSync(`dist/${sport==='basketball'?'basketball/':''}${f}`,'utf8'),sb);}
 return {run:s=>vm.runInContext(s,sb),node,timers};
}
(async()=>{
for(const sport of ['football','basketball']){
 const fx=engine(sport,true);
 const prepare=()=>fx.run("startGame('current');state.teams.forEach((t,i)=>t.squad=playerPool().slice(i*5,i*5+5).map(player=>({player,price:1})));state.phase='done';render()");
 prepare();fx.run('showResults(false)');
 assert.equal(fx.run('state.revealed'),false);assert(fx.node('results').innerHTML.includes('reveal-count'));assert(!fx.node('results').innerHTML.includes('final-score'));
 const count=fx.timers.length;fx.run('showResults(false)');assert.equal(fx.timers.length,count);
 fx.timers.slice(-3).forEach(f=>f());assert.equal(fx.run('state.revealed'),true);assert(fx.node('results').innerHTML.includes('winner-heading'));
 prepare();fx.run('showResults(false)');const stale=fx.timers.slice(-3);fx.run('reset()');stale.forEach(f=>f());assert.equal(fx.node('results').hidden,true);assert.equal(fx.node('results').innerHTML,'');
 prepare();fx.run('showResults(false)');fx.node('skip-reveal').onclick();assert.equal(fx.run('state.revealed'),true);
 console.log(`PASS ${sport}: concealed scores, staged reveal, duplicate-click guard, timer cancellation and skip animation.`);
 const audio=engine(sport);audio.run('globalThis.soundTicks=0;globalThis.soundSettles=0;globalThis.soundSignings=0;window.HBW_SOUND.tick=()=>soundTicks++;window.HBW_SOUND.settle=()=>soundSettles++;window.HBW_SOUND.sign=()=>soundSignings++');
 audio.run("startGame('current')");await audio.run('toss()');assert.equal(audio.run('soundTicks+soundSettles'),0);
 await audio.run('spin()');assert.equal(audio.run('soundTicks'),1);assert.equal(audio.run('soundSettles'),1);
 audio.run("state.phase='free-ready';state.freeTurn=0");await audio.run('spin()');assert.equal(audio.run('soundTicks'),2);assert.equal(audio.run('soundSettles'),1);assert.equal(audio.run('soundSignings'),1);
}
for(const sport of ['football','basketball']){
 const {run,node}=engine(sport);
 for(const mode of ['current','prime']){
  run(`startGame('${mode}')`);await run('toss()');
  // Normal passing stays free and unlimited, even beyond three auctions.
  for(let i=0;i<5;i++){await run('spin()');run('pass(state.turn)');run('pass(state.turn)');assert.equal(run('state.phase'),'unsold');}
  assert(run('state.teams.every(t=>t.soloSkips===0)'));
  // Solo cap for either manager, with broke or full rival.
  for(const t of [0,1])for(const rival of ['broke','full']){
   run(`startGame('${mode}')`);await run('toss()');
   if(rival==='broke')run(`state.teams[${1-t}].money=0`);else run(`state.teams[${1-t}].squad=state.deck.splice(0,5).map(player=>({player,price:1}))`);
   for(let i=0;i<3;i++){await run('spin()');run(`pass(${t})`);}
   await run('spin()');const before=run('JSON.stringify(state)');assert.throws(()=>run(`pass(${t})`),/No solo skips/);assert.equal(run('JSON.stringify(state)'),before);assert(node('auction-controls').innerHTML.includes('Skip (0)'));run(`bid(${t},1)`);assert.equal(run(`soloSkipsLeft(${t})`),0);
  }
  run(`startGame('${mode}')`);await run('toss()');await run('spin()');
  for(const bad of ['bid(1-state.turn)','bid(state.turn,21)','bid(state.turn,1.5)','bid(state.turn,0)'])assert.throws(()=>run(bad));
  assert(!/card-rating|card-stats|TEST RATING|CUSTOM LOCAL RATING/.test(node('card-zone').innerHTML));assert(node('card-zone').innerHTML.includes(run('state.current.name')));
  const first=run('state.turn');run('bid(state.turn,20)');run('pass(state.turn)');assert.equal(run(`state.teams[${first}].money`),0);assert.equal(run('state.phase'),'sold');
  await run('spin()');assert.equal(run('state.turn'),1-first);run('bid(state.turn,20)');assert.equal(run('state.phase'),'free-ready');
  for(let i=0;i<8;i++){const before=run('state.teams.reduce((n,t)=>n+t.squad.length,0)');await run('spin()');assert.equal(run('state.teams.reduce((n,t)=>n+t.squad.length,0)'),before+1);}
  assert.equal(run('state.phase'),'lineup');assert.equal(node('results').hidden,true);assert(!node('team-0').innerHTML.includes('roster-score'));assert(!node('team-0').innerHTML.includes('TEAM RATING'));
  assert.throws(()=>run('showResults(false)'),/Both managers must lock in/);
  const original=run('state.teams[0].order.slice()');run('movePlayer(0,0,4)');assert.equal(run('state.teams[0].order[4]'),original[0]);assert.equal(run('state.teams[0].order[0]'),original[4]);
  const totals=run('state.teams.map(t=>lineupFor(t).total)');run('readyLineup(0)');assert.equal(run('state.phase'),'lineup');assert.equal(run('state.teams[0].ready'),true);assert.throws(()=>run('movePlayer(0,0,1)'),/cannot be changed/);
  run('readyLineup(0)');assert.equal(run('state.teams[0].ready'),false);run('readyLineup(0)');run('readyLineup(1)');assert.equal(run('state.phase'),'done');
  const result=run('showResults(false)');assert(node('results').innerHTML.includes('Adjusted team rating'));assert(node('team-0').innerHTML.includes('roster-score'));assert.equal(result.winner,totals[0]===totals[1]?'draw':`Player ${totals[0]>totals[1]?1:2}`);
  run('reset()');assert(run('state.teams.every(t=>t.money===20&&t.squad.length===0&&t.soloSkips===0)'));assert.equal(run('state.phase'),'toss-ready');
 }
 // Completed games retain accounting and unique signings.
 for(let i=0;i<40;i++){run(`startGame('${i%2?'prime':'current'}')`);await run('toss()');let rounds=0;while(run('state.phase')!=='lineup'&&rounds++<80){await run('spin()');let actions=0;while(run('state.phase')==='bidding'&&actions++<45)run('!canPass(state.turn)||maxBid(state.turn)>state.bid&&(state.bid===0||Math.random()<.65)?bid(state.turn):pass(state.turn)');assert(actions<45);}assert.equal(run('state.phase'),'lineup');assert(run('state.teams.every(t=>t.squad.length===5&&t.money>=0&&t.squad.reduce((n,s)=>n+s.price,0)+t.money===20)'));assert.equal(run('new Set(state.teams.flatMap(t=>t.squad.map(s=>s.player.id))).size'),10);run('readyLineup(0);readyLineup(1)');assert.equal(run('state.phase'),'done');}
 for(const mode of ['current','prime']){
  run(`startGame('${mode}');state.teams[0].squad=playerPool().slice(0,2).map(player=>({player,price:1}));state.teams[1].squad=[{player:playerPool()[3],price:1}];state.teams.forEach(syncLineup);state.phase='bidding';state.turn=0;render()`);
  const from=run('state.teams[0].order.findIndex(id=>id!==null)'),movedId=run(`state.teams[0].order[${from}]`);
  run(`movePlayer(0,${from},4)`);assert.equal(run('state.teams[0].customized'),true);assert(run('canArrange(1)'));
  const rivalSlot=run('state.teams[1].order.findIndex(id=>id!==null)');run(`movePlayer(1,${rivalSlot},${(rivalSlot+1)%5})`);assert.equal(run('state.teams[1].customized'),true);
  run('state.teams[0].squad.push({player:playerPool()[2],price:1});syncLineup(state.teams[0])');assert.equal(run('state.teams[0].order[4]'),movedId);
  run("state.phase='sold';render()");assert(run('canArrange(0)&&canArrange(1)'));
  const otherFrom=run('state.teams[1].order.findIndex(id=>id!==null)');run(`movePlayer(1,${otherFrom},${(otherFrom+1)%5})`);
  run("state.phase='free-ready';state.freeTurn=0;render()");assert(run('canArrange(0)&&canArrange(1)'));
  run("state.phase='bidding';state.turn=1;render()");assert(run('canArrange(0)&&canArrange(1)'));
  run("state.phase='spinning';render()");assert.throws(()=>run('movePlayer(0,4,0)'),/cannot be changed/);
 }
 run("startGame('current')");let pending=run('toss()');run('reset()');await pending;assert.equal(run('state.phase'),'toss-ready');
 console.log(`PASS ${sport}: both modes, bidding guards, unlimited competitive passes, three solo skips, $20 all-in, delayed free picks, results, rematch, 40 complete matches.`);
 if(sport==='basketball'){
  for(const mode of ['current','prime']){
   run(`startGame('${mode}')`);const pool=run('playerPool()');assert.equal(pool.length,100);assert.equal(new Set(pool.map(p=>p.name)).size,100);assert.equal(new Set(pool.map(p=>p.id)).size,100);
   for(const p of pool){assert(p.localTestingOnly&&p.ratingSource==='hbw-local-v1');assert(p.rating>=77&&p.rating<=99);assert(p.stats.length===6&&p.stats.every(v=>Number.isInteger(v)&&v>=25&&v<=99));assert(p.positions.every(p=>['PG','SG','SF','PF','C'].includes(p)));assert(!('face' in p));}
   // Each equal RNG interval selects exactly the corresponding player in either mode.
   run('globalThis.savedRandom=Math.random');for(let i=0;i<100;i++){run(`Math.random=()=>(${i}+.5)/100`);assert.equal(run('drawPlayer(playerPool()).id'),pool[i].id);}run('Math.random=savedRandom');
   // Start with PG/SG/SF filled. Every unclaimed candidate (including another PG) is reachable as a free signing.
   run("globalThis.existing=slots.slice(0,3).map(pos=>playerPool().find(p=>p.pos===pos));globalThis.available=playerPool().filter(p=>!existing.some(e=>e.id===p.id))");const n=run('available.length');
   for(let i=0;i<n;i++){run(`state.teams=[{money:0,squad:existing.map(player=>({player,price:0})),soloSkips:0},{money:0,squad:[],soloSkips:0}];state.phase='free-ready';state.freeTurn=0;Math.random=()=>(${i}+.5)/${n}`);await run('spin()');assert.equal(run('state.teams[0].squad[3].player.id'),run(`available[${i}].id`));}run('Math.random=savedRandom');
  }
  assert.equal(run("fitScore({rating:100,pos:'C',positions:['C']},'PG')"),45);assert.equal(run("fitScore({rating:100,pos:'PG',positions:['PG','SG']},'SG')"),100);assert.equal(run("fitScore({rating:100,pos:'PG',positions:['PG']},'SG')"),92);assert.equal(run("fitScore({rating:100,pos:'PG',positions:['PG']},'SF')"),80);assert.equal(run("fitScore({rating:100,pos:'PG',positions:['PG']},'PF')"),62);
  assert.equal(run("bestLineup(slots.map((pos,i)=>({player:{id:i,pos,positions:[pos],rating:80},price:1}))).rating"),80);
  run("startGame('current');state.phase='done';state.teams=Array.from({length:2},()=>({money:15,soloSkips:0,squad:slots.map((pos,i)=>({player:{id:i,name:'Test',pos,positions:[pos],rating:80},price:1}))}))");assert.equal(run('showResults(false).winner'),'draw');
  console.log('PASS basketball: 100 + 100 records, exact uniform draw intervals, every free candidate reachable regardless of missing slots, position penalties and ties.');
 }
}
console.log('PASS Football player data matches the original SHA-256 baseline.');
})().catch(e=>{console.error(e);process.exitCode=1});
