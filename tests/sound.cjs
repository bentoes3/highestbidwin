const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('dist/sound.js','utf8');
function setup(saved=null,withAudio=true){
 const events=[],attributes={},storage=new Map(saved===null?[]:[['hbw-game-sound',saved]]);
 const button={classList:{toggle(){}},setAttribute(k,v){attributes[k]=v},title:'',onclick:null};
 class AudioContext{
  sampleRate=44100;currentTime=0;state='running';destination={};
  createBuffer(_channels,length){return {getChannelData(){return new Float32Array(length)}}}
  createBufferSource(){return {connect(){},start(){events.push('click')},stop(){}}}
  createBiquadFilter(){return {frequency:{value:0},Q:{value:0},connect(){}}}
  createGain(){return {gain:{setValueAtTime(value){events.push(value)},exponentialRampToValueAtTime(){}},connect(){}}}
  createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){events.push('tone')},stop(){}}}
 }
 const window={localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
 if(withAudio)window.AudioContext=AudioContext;
 const sb={window,document:{getElementById:()=>button},Math};vm.createContext(sb);vm.runInContext(code,sb);
 return {window,button,attributes,storage,events};
}
const game=setup();
assert.equal(game.events.length,0,'Loading the page must stay silent');
assert.equal(game.attributes['aria-pressed'],'true');
game.window.HBW_SOUND.tick(0);game.window.HBW_SOUND.settle();
assert.equal(game.events.filter(x=>x==='click').length,2);
assert.equal(game.events.filter(x=>x==='tone').length,1);
assert(Math.max(...game.events.filter(x=>typeof x==='number'))<=.035,'Effects should remain quiet');
game.button.onclick();const before=game.events.length;
game.window.HBW_SOUND.tick();game.window.HBW_SOUND.settle();
assert.equal(game.events.length,before,'Mute must silence every effect');
assert.equal(game.attributes['aria-pressed'],'false');
assert.equal(game.storage.get('hbw-game-sound'),'off');
game.button.onclick();assert.equal(game.storage.get('hbw-game-sound'),'on');
assert.equal(game.attributes['aria-pressed'],'true');
const returning=setup('off');assert.equal(returning.window.HBW_SOUND.isMuted(),true);
returning.window.HBW_SOUND.tick();assert.equal(returning.events.length,0,'Mute must persist across games');
setup(null,false).window.HBW_SOUND.tick();
console.log('PASS sound: silent load, quiet spin/reveal cues, mute control, persistence and no-audio fallback.');
