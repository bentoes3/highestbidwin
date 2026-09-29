const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('dist/sound.js','utf8');
function setup(saved=null,withAudio=true,home=false){
 const events=[],attributes={},storage=new Map(saved===null?[]:[['hbw-game-sound',saved]]),listeners={};
 const button={classList:{toggle(){}},setAttribute(k,v){attributes[k]=v},title:'',onclick:null};
 const sportLink={href:'/football/',addEventListener(name,fn){listeners[name]=fn}};
 class AudioContext{
  sampleRate=44100;currentTime=0;state='running';destination={};
  createBuffer(_channels,length){return {getChannelData(){return new Float32Array(length)}}}
  createBufferSource(){return {connect(){},start(at){events.push(['snap',at])},stop(){}}}
  createBiquadFilter(){return {frequency:{value:0},Q:{value:0},connect(){}}}
  createGain(){return {gain:{value:0,setValueAtTime(value){events.push(['gain',value])},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){events.push(['master',value])}},connect(){}}}
  createDynamicsCompressor(){return {threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0},connect(){}}}
  createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(at){events.push(['tone',at])},stop(){}}}
 }
 const window={localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},location:{assign(path){events.push(['navigate',path])}},setTimeout(fn){fn()}};
 if(withAudio)window.AudioContext=AudioContext;
 const sb={window,document:{getElementById:()=>button,querySelectorAll:()=>home?[sportLink]:[]},Math};vm.createContext(sb);vm.runInContext(code,sb);
 return {window,button,attributes,storage,events,listeners};
}
const game=setup();
assert.equal(game.events.length,0,'Loading the page must stay silent');
assert.equal(game.attributes['aria-pressed'],'true');
game.window.HBW_SOUND.tick(0);game.window.HBW_SOUND.settle();
assert(game.events.some(([kind])=>kind==='snap'),'Spin needs a mechanical click');
assert(game.events.some(([kind])=>kind==='tone'),'Reel needs a tonal layer');
assert(Math.max(...game.events.filter(([kind])=>kind==='gain').map(([,gain])=>gain))>=.1,'Spin needs to be clearly audible');
for(const kind of ['ui','start','toss','bid','pass','sign','move','lock','countdown','win','draw']){
 const before=game.events.length;game.window.HBW_SOUND[kind]();assert(game.events.length>before,`${kind} must produce a cue`);
}
game.button.onclick();const before=game.events.length;
for(const kind of ['tick','settle','ui','start','toss','bid','pass','sign','move','lock','countdown','win','draw'])game.window.HBW_SOUND[kind]();
assert.equal(game.events.length,before,'Mute must silence every effect');
assert.equal(game.attributes['aria-pressed'],'false');
assert.equal(game.storage.get('hbw-game-sound'),'off');
game.button.onclick();assert.equal(game.storage.get('hbw-game-sound'),'on');
assert.equal(game.attributes['aria-pressed'],'true');
const returning=setup('off');assert.equal(returning.window.HBW_SOUND.isMuted(),true);
returning.window.HBW_SOUND.tick();assert.equal(returning.events.length,0,'Mute must persist across pages');
setup(null,false).window.HBW_SOUND.tick();
const landing=setup(null,true,true);let prevented=false;
landing.listeners.click({button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,preventDefault(){prevented=true}});
assert(prevented,'The sport click should allow the opening sound before navigation');
assert(landing.events.some(([kind,path])=>kind==='navigate'&&path==='/football/'));
console.log('PASS sound: slot cue, action cues, mute, persistence, graceful fallback and home navigation.');
