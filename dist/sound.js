'use strict';
(function(){
 const preference='hbw-game-sound';
 let muted=false,context=null,output=null,clickBuffer=null,lastTick=-1,count=0;
 try{muted=window.localStorage?.getItem(preference)==='off';}catch{}
 const button=document.getElementById('sound-toggle');
 function showPreference(){if(!button)return;button.classList.toggle('muted',muted);button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'Sound off':'Sound on');button.title=muted?'Turn sound on':'Mute sound';}
 function audio(){
  if(muted)return null;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return null;
  try{
   if(!context){
    context=new Audio();
    output=context.createGain();output.gain.value=.8;
    if(context.createDynamicsCompressor){const limiter=context.createDynamicsCompressor();limiter.threshold.value=-18;limiter.knee.value=10;limiter.ratio.value=8;limiter.attack.value=.002;limiter.release.value=.12;output.connect(limiter);limiter.connect(context.destination);}
    else output.connect(context.destination);
   }
   if(context.state==='suspended')context.resume().catch(()=>{});
   return context;
  }catch{return null;}
 }
 function noise(ctx){
  if(clickBuffer)return clickBuffer;
  const length=Math.ceil(ctx.sampleRate*.045);
  clickBuffer=ctx.createBuffer(1,length,ctx.sampleRate);
  const samples=clickBuffer.getChannelData(0);
  for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.008));
  return clickBuffer;
 }
 function tone(ctx,hz,endHz,level,duration,delay=0,type='sine'){
  const at=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(hz,at);if(endHz!==hz)osc.frequency.exponentialRampToValueAtTime(endHz,at+duration);
  gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(level,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(gain);gain.connect(output);osc.start(at);osc.stop(at+duration+.01);
 }
 function snap(ctx,level=.11,progress=0,delay=0){
  const at=ctx.currentTime+delay,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=noise(ctx);filter.type='bandpass';filter.frequency.value=1550-progress*520;filter.Q.value=.9;
  gain.gain.setValueAtTime(level,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.042);
  source.connect(filter);filter.connect(gain);gain.connect(output);source.start(at);source.stop(at+.045);
 }
 function safe(fn){try{const ctx=audio();if(ctx)fn(ctx);}catch{}}
 // A reel rhythm: hard early clicks, with a lower-pitched click at the stop.
 function tick(progress=0){safe(ctx=>{const now=ctx.currentTime;if(now-lastTick<.13)return;lastTick=now;const p=Math.max(0,Math.min(1,progress));const accent=(count++%4===0)?1.18:1;snap(ctx,(.105-.015*p)*accent,p);tone(ctx,310-p*105,195-p*45,.047*accent,.055,0,'triangle');});}
 function settle(){safe(ctx=>{snap(ctx,.16,1);tone(ctx,260,155,.075,.13,0,'triangle');tone(ctx,660,880,.082,.19,.065,'sine');});}
 function ui(){safe(ctx=>{tone(ctx,520,650,.075,.065,0,'triangle');});}
 function start(){safe(ctx=>{tone(ctx,390,490,.075,.09,0,'triangle');tone(ctx,585,740,.085,.13,.08,'sine');});}
 function toss(){safe(ctx=>{[0,.12,.25,.39,.55].forEach((delay,i)=>{snap(ctx,.085-i*.006,0,delay);tone(ctx,540+i*50,620+i*45,.04,.05,delay,'triangle');});});}
 function bid(){safe(ctx=>{snap(ctx,.095,.4);tone(ctx,420,565,.07,.085,0,'triangle');});}
 function pass(){safe(ctx=>{tone(ctx,320,240,.06,.085,0,'triangle');});}
 function sign(){safe(ctx=>{snap(ctx,.14,1);tone(ctx,440,440,.085,.14,.035,'sine');tone(ctx,660,660,.095,.2,.125,'sine');});}
 function move(){safe(ctx=>{tone(ctx,380,510,.045,.075,0,'triangle');});}
 function lock(){safe(ctx=>{snap(ctx,.08,.8);tone(ctx,540,540,.06,.09,.025,'sine');});}
 function countdown(){safe(ctx=>{tone(ctx,520,455,.07,.13,0,'sine');});}
 function win(){safe(ctx=>{snap(ctx,.14,1);[[392,0],[494,.12],[587,.24],[784,.38]].forEach(([hz,delay],i)=>tone(ctx,hz,hz,i===3?.11:.078,i===3?.45:.16,delay,'sine'));});}
 function draw(){safe(ctx=>{snap(ctx,.1,1);tone(ctx,440,440,.085,.21,.025,'sine');tone(ctx,554,554,.085,.23,.095,'sine');});}
 if(button)button.onclick=()=>{muted=!muted;try{window.localStorage?.setItem(preference,muted?'off':'on');}catch{}if(output)output.gain.setTargetAtTime(muted?0:.8,context.currentTime,.012);showPreference();if(!muted)ui();};
 document.querySelectorAll('.sport-choice').forEach(link=>link.addEventListener('click',e=>{
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  e.preventDefault();start();window.setTimeout(()=>window.location.assign(link.href),130);
 }));
 showPreference();
 window.HBW_SOUND={tick,settle,ui,start,toss,bid,pass,sign,move,lock,countdown,win,draw,isMuted:()=>muted};
})();
