/* Cyberwave Radio — ANDRA-18 anchor rig v7 (drop-in)
 * Calibrado para public/assets/host.png, 1024x1536, still frontal ampliada em 1,5x.
 * Compatível com host.js: window.CyberwaveRig.bind/gesture/emote/pose/setTalking/setMouth.
 */
(function(){
  'use strict';
  const root=document.getElementById('cw-host'),img=document.getElementById('cw-host-img');
  if(!root||!img)return;
  const W=1024,H=1536;
  const E=[{x:394,y:473,w:85,h:85,cx:436.5,cy:515.5},{x:550,y:481,w:77,h:77,cx:588.5,cy:519.5}];
  const M={x:438,y:628,w:152,h:72,cx:514,cy:660},J={x:412,y:606,w:204,h:120},P={x:414,y:598,w:200,h:126};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
  const cv=document.createElement('canvas');cv.className='cw-rig';cv.width=W;cv.height=H;cv.setAttribute('aria-hidden','true');
  img.insertAdjacentElement('afterend',cv);const c=cv.getContext('2d');
  const closed=new Image();closed.decoding='async';closed.src=(img.currentSrc||img.src).replace(/host\.png(?:\?.*)?$/,'host_closed.png');
  const visemes=new Image();visemes.decoding='async';visemes.src=(img.currentSrc||img.src).replace(/host\.png(?:\?.*)?$/,'mouth_visemes.png');
  const CFG={amp:1,breathAmount:1,headShiftX:3,headShiftY:2,headRotDeg:.35,bodyShiftX:2,weightShiftX:1,followCursor:true,gestureEveryMs:[4200,7800]};
  const S={t:0,last:0,talking:false,mouth:0,target:0,blink:0,nextBlink:1.5,gazeX:0,gazeY:0,tx:0,ty:0,gesture:'',gt:0,nextGesture:4};
  let ready=0,timeline=[],fallback=null;
  const loaded=()=>{if(++ready===3){img.style.display='none';requestAnimationFrame(frame);}};
  if(img.complete&&img.naturalWidth)loaded();else img.addEventListener('load',loaded,{once:true});closed.onload=loaded;visemes.onload=loaded;
  closed.onerror=()=>{closed.src=img.currentSrc||img.src;};
  function startTalk(){S.talking=true;root.classList.add('is-talking');}
  function stopTalk(){S.talking=false;S.target=0;timeline=[];root.classList.remove('is-talking');}
  function setTalking(v){v?startTalk():stopTalk();}
  function setMouth(v){S.target=clamp(+v||0,0,.78);}
  function schedule(text,start){
    const chars=String(text||'').toLowerCase();let t=start;
    for(const ch of chars){const vowel=/[aáàãâeéêoóôõiíuú]/i.test(ch);timeline.push({at:t,v:vowel?.26+Math.random()*.40:/[mbp]/i.test(ch)?0:.10});t+=52;}
  }
  function bind(u,text){clearTimeout(fallback);timeline=[];u.addEventListener('start',()=>{startTalk();schedule(text,performance.now());});u.addEventListener('boundary',e=>{S.target=.35+Math.random()*.6;if(e.charIndex!=null)schedule(String(text).slice(e.charIndex,e.charIndex+(e.charLength||1)),performance.now());});u.addEventListener('end',stopTalk);u.addEventListener('error',stopTalk);fallback=setTimeout(()=>{if(S.talking&&!timeline.length)schedule(text,performance.now());},250);}
  function gesture(name){S.gesture=name||'nod';S.gt=0;return true;}
  function emote(name,ms){if(name==='wink')S.blink=1;else if(name==='surprised'){S.target=.72;setTimeout(()=>S.target=0,600);}else if(name==='happy')gesture('nod');if(ms&&name!=='neutral')setTimeout(()=>emote('neutral'),ms);}
  function pose(name){CFG.amp=name==='calm'?.55:name==='energetic'?1.15:1;}
  function lookAt(nx,ny){S.tx=clamp(nx*2-1,-1,1);S.ty=clamp(ny*2-1,-1,1);}
  function drawBlink(e,k){if(k<=.01)return;c.save();c.beginPath();c.ellipse(e.cx,e.cy,e.w*.53,e.h*.40,0,0,Math.PI*2);c.clip();c.globalAlpha=smooth(k);c.drawImage(closed,0,0,W,H);c.restore();}
  function drawMouth(open){
    if(open<.035)return;const q=clamp(open/.78*4,0,4),a=Math.floor(q),b=Math.min(5,a+1),mix=q-a;
    c.save();c.globalAlpha=1-mix;c.drawImage(visemes,a*P.w,0,P.w,P.h,P.x,P.y,P.w,P.h);
    if(mix>.01){c.globalAlpha=mix;c.drawImage(visemes,b*P.w,0,P.w,P.h,P.x,P.y,P.w,P.h);}c.restore();
  }
  function frame(now){
    if(root.offsetParent===null){S.last=now;requestAnimationFrame(frame);return;}
    const dt=Math.min(.05,(now-(S.last||now))/1000);S.last=now;S.t+=dt;S.nextBlink-=dt;S.nextGesture-=dt;
    if(S.nextBlink<=0){S.blink=1;S.nextBlink=2+Math.random()*3.8;}if(S.blink>0)S.blink=Math.max(0,S.blink-dt/.15);
    if(S.nextGesture<=0&&!S.talking){gesture('nod');S.nextGesture=4+Math.random()*4;}
    if(S.gesture){S.gt+=dt;if(S.gt>1.2){S.gesture='';S.gt=0;}}
    while(timeline.length&&timeline[0].at<=now)S.target=timeline.shift().v;
    if(S.talking&&!timeline.length)S.target=Math.max(.06,.10+.48*(.5+.5*Math.sin(S.t*25))*(.5+.5*Math.sin(S.t*16.5)));
    if(!S.talking)S.target=Math.max(0,S.target-dt*3);
    S.mouth=lerp(S.mouth,S.target,1-Math.exp(-dt*18));S.gazeX=lerp(S.gazeX,S.tx,1-Math.exp(-dt*7));S.gazeY=lerp(S.gazeY,S.ty,1-Math.exp(-dt*7));
    const g=Math.min(1,S.gt/1.1),pulse=Math.sin(g*Math.PI),nod=S.gesture==='nod'?Math.sin(g*Math.PI*2)*pulse*2.2:S.gesture==='shake'?Math.sin(g*Math.PI*3)*pulse*2.2:0;
    const lean=S.gesture==='lean'?pulse*1.5:0,breath=Math.sin(S.t*1.48)*CFG.amp*CFG.breathAmount,x=Math.sin(S.t*.57)*.45*CFG.amp+S.gazeX*.8+lean;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,H);c.save();c.translate(x,nod-breath*1.7);c.translate(512,1080);c.scale(1+breath*.0011,1+breath*.0015);c.translate(-512,-1080);c.drawImage(img,0,0,W,H);
    const bp=S.blink>.5?(1-S.blink)*2:S.blink*2;drawBlink(E[0],bp);drawBlink(E[1],bp);drawMouth(S.mouth);c.restore();requestAnimationFrame(frame);
  }
  root.addEventListener('pointermove',e=>{if(!CFG.followCursor)return;const r=root.getBoundingClientRect();lookAt((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:true});
  root.addEventListener('pointerdown',()=>{if(!S.talking){gesture('nod');emote('happy');}});
  window.CyberwaveRig={bind,gesture,emote,lookAt,pose,follow:v=>CFG.followCursor=!!v,setMouth,setTalking,config:CFG,gestures:['nod','shake','lean','wave','present','pointLeft','pointRight','openArms','shrug','thumbsUp','headsetTouch'],emotes:['neutral','happy','surprised','thinking','wink'],presets:['calm','energetic','dj'],landmarks:{eyes:E,mouth:M,jaw:J}};
})();
