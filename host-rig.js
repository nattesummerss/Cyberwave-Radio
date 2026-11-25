/* Cyberwave Radio — ANDRA-18 anchor rig v8 "camada de vida" (v37)
 * Mesma still frontal (public/assets/host.png, 1024x1536, ampliada 1,5x), mesmos olhos e boca do rig v7.
 * Compatível com host.js: window.CyberwaveRig.bind/gesture/emote/pose/setTalking/setMouth/lookAt/state.
 *
 * O que muda em relação ao v7 (v36):
 *  - cabeça em camada própria: a cabeça (com cabelo e fone) se move separada dos ombros, com máscara suave;
 *    inclina, vira um pouco para os lados e sobe/desce sem nunca repetir o mesmo movimento;
 *  - "pontos de atenção": a cada 2–6 s ela muda levemente para onde está olhando, com início rápido e parada suave;
 *  - piscadas humanas: intervalos irregulares, às vezes duas seguidas, e piscada junto com uma virada maior de cabeça;
 *  - fala: acenos curtos nos trechos mais fortes da voz e sobrancelhas que sobem na ênfase;
 *  - boca: abre rápido e fecha mais devagar (transição suave entre quadros, como no v7);
 *  - respiração e balanço do corpo continuam do v7; quem prefere menos movimento no sistema ganha ~40% da amplitude;
 *  - intensidade geral em CyberwaveRig.config.life (padrão 1; 0,6 mais discreta, 1,3 mais expressiva).
 * Integração no site marcada com "[site]", como no v7.
 */
(function(){
  'use strict';
  const root=document.getElementById('cw-host'),img=document.getElementById('cw-host-img');
  if(!root||!img)return;
  const W=1024,H=1536;
  const E=[{x:394,y:473,w:85,h:85,cx:436.5,cy:515.5},{x:550,y:481,w:77,h:77,cx:588.5,cy:519.5}];
  const M={x:438,y:628,w:152,h:72,cx:514,cy:660},J={x:412,y:606,w:204,h:120},P={x:414,y:598,w:200,h:126};
  // v8: região do rosto redesenhada a cada quadro, sobrancelhas, camada da cabeça e pivô (base do pescoço).
  const FR={x:356,y:426,w:312,h:310};
  const BROWS=[{cx:437,cy:476,rx:66,ry:26},{cx:586,cy:477,rx:56,ry:25}];
  const HB={x:236,y:168,w:560,h:720},HEAD={cx:514,cy:510,rx:272,ry:348},PIV={x:514,y:880};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t),rnd=(a,b)=>a+Math.random()*(b-a);
  const mk=(w,h)=>{const k=document.createElement('canvas');k.width=w;k.height=h;return k;};
  const cv=mk(W,H);cv.className='cw-rig';cv.setAttribute('aria-hidden','true');
  img.insertAdjacentElement('afterend',cv);const c=cv.getContext('2d');
  const F=mk(FR.w,FR.h),f=F.getContext('2d');f.translate(-FR.x,-FR.y); // rosto: still + piscada + boca + sobrancelhas
  const HS=mk(HB.w,HB.h),HM=mk(HB.w,HB.h);         // camada da cabeça (recortada uma vez) e máscara suave
  const BC=mk(FR.w,90),bc=BC.getContext('2d'),BM=mk(FR.w,90); // sobrancelhas
  (function masks(){
    const m=HM.getContext('2d');m.save();m.translate(HEAD.cx-HB.x,HEAD.cy-HB.y);m.scale(1,HEAD.ry/HEAD.rx);
    let g=m.createRadialGradient(0,0,0,0,0,HEAD.rx);g.addColorStop(0,'#000');g.addColorStop(.74,'#000');g.addColorStop(1,'rgba(0,0,0,0)');
    m.fillStyle=g;m.fillRect(-HEAD.rx,-HEAD.rx,HEAD.rx*2,HEAD.rx*2);m.restore();
    const b=BM.getContext('2d');
    for(const r of BROWS){b.save();b.translate(r.cx-FR.x,r.cy-(FR.y+4));b.scale(1,r.ry/r.rx);
      g=b.createRadialGradient(0,0,0,0,0,r.rx);g.addColorStop(0,'#000');g.addColorStop(.55,'#000');g.addColorStop(1,'rgba(0,0,0,0)');
      b.fillStyle=g;b.fillRect(-r.rx,-r.rx,r.rx*2,r.rx*2);b.restore();}
  })();
  const closed=new Image();closed.decoding='async';closed.src=(img.currentSrc||img.src).replace(/host\.png(?:\?.*)?$/,'host_closed.png');
  const visemes=new Image();visemes.decoding='async';visemes.src=(img.currentSrc||img.src).replace(/host\.png(?:\?.*)?$/,'mouth_visemes.png');
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CFG={amp:1,life:1,breathAmount:1,headShiftX:3,headShiftY:2,headRotDeg:.35,bodyShiftX:2,weightShiftX:1,followCursor:true,gestureEveryMs:[4200,7800]};
  const S={t:0,last:0,talking:false,mouth:0,target:0,
    blinkT:-1,nextBlink:1.4,doubleBlink:false,gazeX:0,gazeY:0,tx:0,ty:0,gesture:'',gt:0,
    // cabeça: alvo (atenção), posição e velocidade (mola) — yaw/pitch em -1..1, roll em graus
    aim:{yaw:0,pitch:0,roll:0},hp:{yaw:0,pitch:0,roll:0},hv:{yaw:0,pitch:0,roll:0},nextAim:1.2,
    brow:0,browT:0,nextIdleBrow:rnd(6,14),env:0,envSlow:0,nodCool:0,ph:[rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9)]};
  let ready=0,timeline=[],fallback=null,freq=null;
  const loaded=()=>{if(++ready===3){const h=HS.getContext('2d');h.drawImage(img,HB.x,HB.y,HB.w,HB.h,0,0,HB.w,HB.h);h.globalCompositeOperation='destination-in';h.drawImage(HM,0,0);
    img.style.display='none';requestAnimationFrame(frame);}};
  if(img.complete&&img.naturalWidth)loaded();else img.addEventListener('load',loaded,{once:true});closed.onload=loaded;visemes.onload=loaded;
  closed.onerror=()=>{closed.src=img.currentSrc||img.src;};
  function startTalk(){S.talking=true;root.classList.add('is-talking');S.nextAim=Math.min(S.nextAim,.4);}
  function stopTalk(){S.talking=false;S.target=0;timeline=[];root.classList.remove('is-talking');}
  function setTalking(v){v?startTalk():stopTalk();}
  function setMouth(v){S.target=clamp(+v||0,0,.78);}
  function schedule(text,start){
    const chars=String(text||'').toLowerCase();let t=start;
    for(const ch of chars){const vowel=/[aáàãâeéêoóôõiíuú]/i.test(ch);timeline.push({at:t,v:vowel?.26+Math.random()*.40:/[mbp]/i.test(ch)?0:.10});t+=52;}
  }
  function bind(u,text,opts){const last=!opts||opts.last!==false; // [site] opts.last===false: ainda há trecho (outro idioma) depois deste
    clearTimeout(fallback);timeline=[];u.addEventListener('start',()=>{startTalk();schedule(text,performance.now());});u.addEventListener('boundary',e=>{S.target=.35+Math.random()*.6;if(e.charIndex!=null)schedule(String(text).slice(e.charIndex,e.charIndex+(e.charLength||1)),performance.now());});u.addEventListener('end',last?stopTalk:()=>{timeline=[];});u.addEventListener('error',stopTalk);fallback=setTimeout(()=>{if(S.talking&&!timeline.length)schedule(text,performance.now());},250);}
  const HEAD_GESTURES=['nod','shake','lean']; // [site] só a cabeça se move na still frontal
  function gesture(name){S.gesture=HEAD_GESTURES.includes(name)?name:name==='shrug'?'shake':'nod';S.gt=0;
    if(name==='headsetTouch'||name==='present'||name==='pointLeft')S.aim.roll=rnd(-1,-.5); // v8: inclina para o lado
    return true;}
  function raiseBrows(k,ms){S.brow=Math.max(S.brow,k);S.browT=ms/1000;}
  function emote(name,ms){if(name==='wink')blink(false);else if(name==='surprised'){S.target=.72;raiseBrows(1,900);setTimeout(()=>S.target=0,600);}
    else if(name==='happy'){gesture('nod');raiseBrows(.5,500);}else if(name==='thinking'){S.aim={yaw:rnd(.3,.6)*(Math.random()<.5?-1:1),pitch:-.5,roll:rnd(.6,1)};S.nextAim=2.5;}
    if(ms&&name!=='neutral')setTimeout(()=>emote('neutral'),ms);}
  function pose(name){CFG.amp=name==='calm'?.55:name==='energetic'?1.15:1;}
  function lookAt(nx,ny){S.tx=clamp(nx*2-1,-1,1);S.ty=clamp(ny*2-1,-1,1);}
  function blink(dbl){if(S.blinkT<=-1){S.blinkT=0;S.doubleBlink=dbl===undefined?Math.random()<.18:dbl;}}
  // piscada: fecha em ~75 ms, fica ~30 ms fechada, abre em ~150 ms (como as pessoas)
  function blinkAmount(){const t=S.blinkT;if(t<0)return 0;if(t<.075)return smooth(t/.075);if(t<.105)return 1;if(t<.255)return 1-smooth((t-.105)/.15);return 0;}
  function newAim(){
    const L=CFG.life*(reduce?.4:1),talk=S.talking;
    const big=Math.random()<(talk?.3:.22);
    const yaw=(big?rnd(.45,.95):rnd(0,.45))*(Math.random()<.5?-1:1);
    S.aim={yaw:yaw*L,pitch:rnd(-.5,.45)*L,roll:rnd(-1,1)*(talk?1.1:.8)*L};
    if(big&&Math.random()<.4)blink(false);
    S.nextAim=talk?rnd(1.2,3.2):rnd(2,6);
  }
  function drawBlink(e,k){if(k<=.01)return;f.save();f.beginPath();f.ellipse(e.cx,e.cy,e.w*.53,e.h*.40,0,0,Math.PI*2);f.clip();f.globalAlpha=k;f.drawImage(closed,0,0,W,H);f.restore();}
  function drawMouth(open){
    if(open<.035)return;const q=clamp(open/.78*4,0,4),a=Math.floor(q),b=Math.min(5,a+1),mix=q-a;
    f.save();f.globalAlpha=1-mix;f.drawImage(visemes,a*P.w,0,P.w,P.h,P.x,P.y,P.w,P.h);
    if(mix>.01){f.globalAlpha=mix;f.drawImage(visemes,b*P.w,0,P.w,P.h,P.x,P.y,P.w,P.h);}f.restore();
  }
  function drawBrows(k){if(k<.02)return;const lift=k*3.6;
    bc.globalCompositeOperation='copy';bc.drawImage(img,FR.x,FR.y+4+lift,FR.w,90,0,0,FR.w,90);
    bc.globalCompositeOperation='destination-in';bc.drawImage(BM,0,0);bc.globalCompositeOperation='source-over';
    f.drawImage(BC,FR.x,FR.y+4);}
  function spring(dt){const k=S.talking?52:34,d=2*Math.sqrt(k)*.92; // mola quase criticamente amortecida
    for(const a of ['yaw','pitch','roll']){S.hv[a]+=((S.aim[a]-S.hp[a])*k-S.hv[a]*d)*dt;S.hp[a]+=S.hv[a]*dt;}}
  function frame(now){
    if(root.offsetParent===null){S.last=now;requestAnimationFrame(frame);return;}
    const dt=Math.min(.05,(now-(S.last||now))/1000);S.last=now;S.t+=dt;
    const L=CFG.life*(reduce?.4:1);
    // piscadas
    S.nextBlink-=dt;if(S.nextBlink<=0){blink();S.nextBlink=clamp(1.6+(-Math.log(1-Math.random()))*2.6,1.4,8.5);}
    if(S.blinkT>-1){S.blinkT+=dt;if(S.blinkT>.255){if(S.doubleBlink){S.doubleBlink=false;S.blinkT=-.09;}else S.blinkT=-1;}}
    const bk=S.blinkT<0?0:blinkAmount();
    // atenção (para onde a cabeça aponta)
    S.nextAim-=dt;if(S.nextAim<=0)newAim();
    // gestos de cabeça (nod/shake/lean), agora só na camada da cabeça
    if(S.gesture){S.gt+=dt;if(S.gt>1.2){S.gesture='';S.gt=0;}}
    S.nodCool-=dt;
    // boca
    while(timeline.length&&timeline[0].at<=now)S.target=timeline.shift().v;
    const an=window.cwHostAnalyser; // [site] MP3 da voz neural tocando: a boca segue a energia da voz
    if(S.talking&&an&&an.frequencyBinCount){if(!freq||freq.length!==an.frequencyBinCount)freq=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(freq);let sum=0;for(let i=2;i<40;i++)sum+=freq[i];S.target=clamp(sum/38/255*2.6,0,1)*.66;}
    else if(S.talking&&!timeline.length)S.target=Math.max(.06,.10+.48*(.5+.5*Math.sin(S.t*25))*(.5+.5*Math.sin(S.t*16.5)));
    if(!S.talking)S.target=Math.max(0,S.target-dt*3);
    S.mouth=lerp(S.mouth,S.target,1-Math.exp(-dt*(S.target>S.mouth?22:13)));
    // ênfase na fala: energia acima da média recente -> aceno curto e sobrancelhas
    S.env=lerp(S.env,S.talking?S.target:0,1-Math.exp(-dt*10));S.envSlow=lerp(S.envSlow,S.env,1-Math.exp(-dt*1.2));
    if(S.talking&&S.nodCool<=0&&S.env>.3&&S.env-S.envSlow>.12){
      S.hv.pitch+=rnd(5,8)*L;S.nodCool=rnd(.9,2.2);if(Math.random()<.45)raiseBrows(rnd(.55,.9),rnd(350,650));}
    // sobrancelhas: às vezes também em silêncio (reação discreta)
    S.nextIdleBrow-=dt;if(S.nextIdleBrow<=0){if(!S.talking)raiseBrows(rnd(.3,.55),rnd(400,700));S.nextIdleBrow=rnd(7,16);}
    S.browT-=dt;const browGoal=S.browT>0?S.brow:0;if(S.browT<=0)S.brow=0;
    S.browCur=lerp(S.browCur||0,browGoal*L,1-Math.exp(-dt*(browGoal>(S.browCur||0)?14:6)));
    // olhar segue o cursor
    S.gazeX=lerp(S.gazeX,S.tx,1-Math.exp(-dt*4));S.gazeY=lerp(S.gazeY,S.ty,1-Math.exp(-dt*4));
    spring(dt);
    // ---- rosto (só a região de olhos/sobrancelhas/boca é redesenhada) ----
    f.drawImage(img,FR.x,FR.y,FR.w,FR.h,FR.x,FR.y,FR.w,FR.h);
    drawBrows(S.browCur);drawBlink(E[0],bk);drawBlink(E[1],bk);drawMouth(S.mouth);
    // ---- corpo (respiração e balanço do v7) ----
    const g=Math.min(1,S.gt/1.1),pulse=Math.sin(g*Math.PI);
    const gNod=S.gesture==='nod'?Math.sin(g*Math.PI*2)*pulse:0,gShake=S.gesture==='shake'?Math.sin(g*Math.PI*3)*pulse:0,gLean=S.gesture==='lean'?pulse:0;
    const breath=Math.sin(S.t*1.48)*CFG.amp*CFG.breathAmount*(reduce?.5:1),bx=Math.sin(S.t*.57)*.45*CFG.amp+gLean*1.2;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,H);c.save();c.translate(bx,-breath*1.7);c.translate(512,1080);c.scale(1+breath*.0011,1+breath*.0015);c.translate(-512,-1080);
    c.drawImage(img,0,0,W,H);
    // ---- cabeça: ruído suave que nunca se repete + atenção + gestos + cursor ----
    const p=S.ph,t=S.t,A=CFG.amp*L;
    const nYaw=(Math.sin(t*.31+p[0])*.55+Math.sin(t*.73+p[1])*.3+Math.sin(t*1.9+p[2])*.08)*.35*A;
    const nPit=(Math.sin(t*.27+p[3])*.5+Math.sin(t*.61+p[4])*.3+Math.sin(t*2.3+p[5])*.1)*.35*A;
    const nRol=(Math.sin(t*.23+p[2])*.6+Math.sin(t*.53+p[0])*.4)*.45*A;
    const yaw=S.hp.yaw+nYaw+S.gazeX*.35*(CFG.followCursor?1:0)+gShake*.9;
    const pitch=S.hp.pitch+nPit+S.gazeY*.25*(CFG.followCursor?1:0)+gNod*1.1+breath*.06;
    const roll=S.hp.roll+nRol+gLean*1.1;
    c.translate(PIV.x+yaw*4.2,PIV.y+pitch*3.2);c.rotate(roll*Math.PI/180);c.scale(1-Math.abs(yaw)*.006,1-pitch*.005);c.translate(-PIV.x,-PIV.y);
    c.drawImage(HS,HB.x,HB.y);c.drawImage(F,FR.x,FR.y); // o rosto fica dentro da parte opaca da máscara
    c.restore();requestAnimationFrame(frame);
  }
  root.addEventListener('pointermove',e=>{if(!CFG.followCursor)return;const r=root.getBoundingClientRect();lookAt((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:true});
  root.addEventListener('pointerleave',()=>lookAt(.5,.5),{passive:true});
  root.addEventListener('pointerdown',()=>{if(!S.talking){gesture('nod');emote('happy');}});
  // [site] Botões do cartão (index.html: Acenar, Joinha, Surpresa) e comandos pelo evento 'cw:host' {cmd,arg}.
  const CMDS={gesture:a=>gesture(a),emote:a=>emote(a),say:a=>window.CyberwaveHost&&window.CyberwaveHost.speak(a),pose:a=>pose(a),follow:a=>{CFG.followCursor=a!==false&&a!=='false';}};
  document.addEventListener('cw:host',e=>{const d=e.detail||{};if(CMDS[d.cmd])CMDS[d.cmd](d.arg);});
  document.addEventListener('click',e=>{const el=e.target&&e.target.closest&&e.target.closest('[data-cw-gesture],[data-cw-emote],[data-cw-say],[data-cw-pose]');if(!el)return;const d=el.dataset;
    if(d.cwGesture)gesture(d.cwGesture);if(d.cwEmote)emote(d.cwEmote);if(d.cwPose)pose(d.cwPose);if(d.cwSay)CMDS.say(d.cwSay);});
  window.CyberwaveRig={bind,gesture,emote,lookAt,pose,blink,follow:v=>CFG.followCursor=!!v,setMouth,setTalking,config:CFG,
    state:()=>({ready:ready>=3,rig:'v8',talking:S.talking,mouth:+S.mouth.toFixed(3),gesture:S.gesture,breath:CFG.breathAmount,life:CFG.life,
      head:{yaw:+S.hp.yaw.toFixed(2),pitch:+S.hp.pitch.toFixed(2),roll:+S.hp.roll.toFixed(2)},brows:+(S.browCur||0).toFixed(2),reducedMotion:!!reduce}), // [site]
    gestures:['nod','shake','lean','wave','present','pointLeft','pointRight','openArms','shrug','thumbsUp','headsetTouch'],emotes:['neutral','happy','surprised','thinking','wink'],presets:['calm','energetic','dj'],landmarks:{eyes:E,mouth:M,jaw:J,brows:BROWS,head:HEAD,pivot:PIV}};
})();
