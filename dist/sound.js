'use strict';
(function(){
 const preference='hbw-game-sound';
 let muted=false,context=null,clickBuffer=null;
 try{muted=window.localStorage?.getItem(preference)==='off';}catch{}
 const button=document.getElementById('sound-toggle');
 function showPreference(){if(!button)return;button.classList.toggle('muted',muted);button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'Game sound off':'Game sound on');button.title=muted?'Turn game sound on':'Mute game sound';}
 function audio(){
  if(muted)return null;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return null;
  try{if(!context)context=new Audio();if(context.state==='suspended')context.resume().catch(()=>{});return context;}catch{return null;}
 }
 function noise(ctx){
  if(clickBuffer)return clickBuffer;
  const length=Math.ceil(ctx.sampleRate*.028);
  clickBuffer=ctx.createBuffer(1,length,ctx.sampleRate);
  const samples=clickBuffer.getChannelData(0);
  for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.004));
  return clickBuffer;
 }
 function click(ctx,progress=0){
  const when=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=noise(ctx);filter.type='bandpass';filter.frequency.value=950+(1-progress)*500;filter.Q.value=.7;
  gain.gain.setValueAtTime(.029-.008*progress,when);gain.gain.exponentialRampToValueAtTime(.001,when+.027);
  source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start(when);source.stop(when+.03);
 }
 function tick(progress=0){try{const ctx=audio();if(ctx)click(ctx,Math.max(0,Math.min(1,progress)));}catch{}}
 function settle(){
  try{
   const ctx=audio();if(!ctx)return;
   click(ctx,1);
   const when=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='sine';osc.frequency.setValueAtTime(420,when);osc.frequency.exponentialRampToValueAtTime(310,when+.12);
   gain.gain.setValueAtTime(.018,when);gain.gain.exponentialRampToValueAtTime(.001,when+.15);
   osc.connect(gain);gain.connect(ctx.destination);osc.start(when);osc.stop(when+.16);
  }catch{}
 }
 if(button)button.onclick=()=>{muted=!muted;try{window.localStorage?.setItem(preference,muted?'off':'on');}catch{}showPreference();if(!muted)tick(.5);};
 showPreference();
 window.HBW_SOUND={tick,settle,isMuted:()=>muted};
})();
