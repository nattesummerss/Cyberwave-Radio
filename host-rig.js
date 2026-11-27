/* Cyberwave Radio — ANDRA-18 anchor rig v8.3 "camada de vida" (v40)
 * v40: sílabas visíveis. Voz gravada (MP3): a boca lê o volume real do som a cada quadro (sem a suavização do
 *      analisador, que deixava a boca parada aberta), normaliza pelo volume da própria fala e fecha nas consoantes.
 *      Voz do navegador: cada palavra vira sílabas (abre na vogal, fecha na consoante; m/b/p fecham os lábios), no
 *      ritmo medido da própria voz. A forma também muda: o/u arredondam, i/e esticam, a abre mais.
 * v39: boca nova. Em vez de colar quadros de boca por cima da foto (deixavam um halo escuro e abriam pouco), a boca
 *      é feita deformando os próprios lábios da foto: o lábio de baixo e o queixo descem, o de cima sobe um pouco e
 *      aparece o interior da boca com os dentes de cima. mouth_visemes.png não é mais usado.
 * v38: começa a animar só com host.png; host_closed.png e mouth_visemes.png são opcionais (tenta de novo 1x e, se
 *      falharem, ela anima sem esses quadros). O canvas fica por cima da foto (posição absoluta), então a foto nunca
 *      sai do lugar, mesmo se algo falhar.
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
  const FR={x:356,y:426,w:312,h:336};
  const BROWS=[{cx:437,cy:476,rx:66,ry:26},{cx:586,cy:477,rx:56,ry:25}];
  const HB={x:236,y:168,w:560,h:720},HEAD={cx:514,cy:510,rx:272,ry:348},PIV={x:514,y:880};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t),rnd=(a,b)=>a+Math.random()*(b-a);
  const mk=(w,h)=>{const k=document.createElement('canvas');k.width=w;k.height=h;return k;};
  const cv=mk(W,H);cv.className='cw-rig';cv.setAttribute('aria-hidden','true');
  cv.style.position='absolute';cv.style.left='0';cv.style.top='0'; // [v38] por cima da foto: nunca empurra a foto para o lado
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
  // [v38] imagens extras opcionais: tenta de novo uma vez (sem cache) e, se falhar, segue sem elas.
  const extra=(name)=>{const o=new Image();o.decoding='async';o.ok=false;o.tries=0;const url=(img.currentSrc||img.src).replace(/host\.png(?:\?.*)?$/,name);
    o.onload=()=>{o.ok=true;};o.onerror=()=>{if(++o.tries<2)o.src=url+'?r='+Date.now();};o.src=url;return o;};
  const closed=extra('host_closed.png');
  // [v39] boca deformando a foto: linha entre os lábios medida em host.png (x de 444 a 580)
  const MR={x:426,y:626,w:178,h:134},LIP=[[444,653],[452,656],[460,659],[468,661],[480,661],[496,661],[512,662],[528,662],[544,661],[556,661],[564,659],[572,656],[580,653]];
  const lipY=x=>{if(x<=LIP[0][0])return LIP[0][1];for(let i=1;i<LIP.length;i++)if(x<=LIP[i][0]){const a=LIP[i-1],b=LIP[i],t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}return LIP[LIP.length-1][1];};
  const MC=mk(MR.w,MR.h),mc=MC.getContext('2d');let MSRC=null,MOUT=null;
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CFG={amp:1,life:1,breathAmount:1,headShiftX:3,headShiftY:2,headRotDeg:.35,bodyShiftX:2,weightShiftX:1,followCursor:true,gestureEveryMs:[4200,7800]};
  const S={t:0,last:0,talking:false,mouth:0,target:0,
    blinkT:-1,nextBlink:1.4,doubleBlink:false,gazeX:0,gazeY:0,tx:0,ty:0,gesture:'',gt:0,
    // cabeça: alvo (atenção), posição e velocidade (mola) — yaw/pitch em -1..1, roll em graus
    aim:{yaw:0,pitch:0,roll:0},hp:{yaw:0,pitch:0,roll:0},hv:{yaw:0,pitch:0,roll:0},nextAim:1.2,
    brow:0,browT:0,nextIdleBrow:rnd(6,14),env:0,envSlow:0,nodCool:0,ph:[rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9),rnd(0,9)]};
  let ready=0,fallback=null,freq=null,tbuf=null;const AU={peak:.05,fast:0,slow:0,shape:0};
  const loaded=()=>{if(ready)return;ready=3;{try{const t=mk(MR.w,MR.h).getContext('2d');t.drawImage(img,MR.x,MR.y,MR.w,MR.h,0,0,MR.w,MR.h);MSRC=t.getImageData(0,0,MR.w,MR.h);MOUT=mc.createImageData(MR.w,MR.h);}catch(e){MSRC=null;}const h=HS.getContext('2d');h.drawImage(img,HB.x,HB.y,HB.w,HB.h,0,0,HB.w,HB.h);h.globalCompositeOperation='destination-in';h.drawImage(HM,0,0);
    img.style.display='none';requestAnimationFrame(frame);}};
  if(img.complete&&img.naturalWidth)loaded();else img.addEventListener('load',loaded,{once:true});
  function startTalk(){S.talking=true;root.classList.add('is-talking');S.nextAim=Math.min(S.nextAim,.4);}
  function stopTalk(){S.talking=false;S.target=0;pulses=[];root.classList.remove('is-talking');}
  function setTalking(v){v?startTalk():stopTalk();}
  function setMouth(v){S.target=clamp(+v||0,0,.78);}
  // [v40] sílabas: abre na vogal, fecha na consoante seguinte. shape: -1 esticada (i/e), 0 neutra (a), 1 redonda (o/u).
  const VQ=[[/[aáàâã]/,1,0],[/[óõ]/,.82,.6],[/[ô]/,.7,.8],[/[o]/,.72,.75],[/[u]/,.48,1],[/[éê]/,.78,-.35],[/[e]/,.66,-.45],[/[iíy]/,.46,-.85]];
  function syllables(word){
    const w=String(word||'').toLowerCase().replace(/[^a-zà-ÿ]/g,'');const out=[];
    if(!w)return out;
    const re=/([^aeiouyáàâãéêíóôõú]*)([aeiouyáàâãéêíóôõú]+)/g;let m,last=0;
    while((m=re.exec(w))){const v=m[2];let q=VQ.find(r=>r[0].test(v[0]))||VQ[0];if(v.length>1){const q2=VQ.find(r=>r[0].test(v[v.length-1]));if(q2&&q2[1]>q[1])q=q2;}
      out.push({open:q[1]*(.86+Math.random()*.18),shape:q[2],w:1+.22*m[1].length,close:.16});last=re.lastIndex;}
    if(!out.length)out.push({open:.35,shape:0,w:1,close:.1});
    // consoante depois de cada vogal define o fechamento: m/b/p fecham os lábios, f/v quase
    let i=0;w.replace(/[aeiouyáàâãéêíóôõú]+([^aeiouyáàâãéêíóôõú]?)/g,(_,c)=>{if(out[i]){out[i].close=/[mbp]/.test(c)?0:/[fv]/.test(c)?.06:c?.14:.2;}i++;return _;});
    if(last<w.length)out[out.length-1].w+=.25*(w.length-last);
    return out;
  }
  // linha do tempo de sílabas {at,dur,open,shape,close}
  let pulses=[],sylMs=175,lastB=0,lastBSyl=0;
  function queueWord(word,at,gap){const syl=syllables(word);for(const q of syl){const dur=sylMs*q.w;pulses.push({at,dur,open:q.open,shape:q.shape,close:q.close});at+=dur;}return at+(gap||0);}
  function schedule(text,start){pulses=[];let at=start;for(const wd of String(text||'').split(/\s+/)){if(!wd)continue;at=queueWord(wd,at,/[.,;:!?]$/.test(wd)?sylMs*1.2:sylMs*.15);}}
  function pulseNow(now){
    while(pulses.length&&pulses[0].at+pulses[0].dur<now)pulses.shift();
    const p=pulses[0];if(!p||p.at>now)return null;
    const k=(now-p.at)/p.dur,rise=smooth(clamp(k/.38,0,1)),fall=smooth(clamp((k-.62)/.38,0,1));
    return {v:p.open*rise*(1-fall)+p.close*fall*.9,shape:p.shape};
  }
  function bind(u,text,opts){const last=!opts||opts.last!==false; // [site] opts.last===false: ainda há trecho (outro idioma) depois deste
    clearTimeout(fallback);pulses=[];let gotWord=false;const rate=u.rate||1;sylMs=clamp(sylMs,120,260);
    u.addEventListener('start',()=>{startTalk();lastB=0;fallback=setTimeout(()=>{if(S.talking&&!gotWord)schedule(text,performance.now());},260);});
    u.addEventListener('boundary',e=>{if(e.name&&e.name!=='word')return;const now=performance.now();
      const len=e.charLength||(String(text).slice(e.charIndex).match(/^\S+/)||[''])[0].length,word=String(text).slice(e.charIndex,e.charIndex+len);
      // calibra a duração da sílaba pelo intervalo real entre palavras desta voz
      if(lastB&&lastBSyl){const ms=(now-lastB)/(lastBSyl+.35);if(ms>70&&ms<420)sylMs=lerp(sylMs,ms,.35);}
      lastB=now;lastBSyl=syllables(word).reduce((n,q)=>n+q.w,0);
      if(!gotWord){gotWord=true;pulses=[];}pulses=pulses.filter(p=>p.at<now&&p.at+p.dur>now).slice(0,1);
      queueWord(word,pulses.length?pulses[0].at+pulses[0].dur:now,0);});
    u.addEventListener('end',last?stopTalk:()=>{pulses=[];});u.addEventListener('error',stopTalk);void rate;}
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
  function drawBlink(e,k){if(k<=.01||!closed.ok)return;f.save();f.beginPath();f.ellipse(e.cx,e.cy,e.w*.53,e.h*.40,0,0,Math.PI*2);f.clip();f.globalAlpha=k;f.drawImage(closed,0,0,W,H);f.restore();}
  // [v39] open 0..1: lábio de baixo + queixo descem até ~13 px, lábio de cima sobe até ~2,5 px, interior escuro com dentes.
  function drawMouth(open,shape){
    if(open<.02||!MSRC)return;shape=clamp(shape||0,-1,1);
    const rnd_=Math.max(0,shape),spr=Math.max(0,-shape),half=57*(1-.24*rnd_+.06*spr); // o/u: boca mais estreita; i/e: mais larga
    const D=21*open*(1-.18*spr+.06*rnd_),U=3.6*open*(1+.5*rnd_),src=MSRC.data,out=MOUT.data,w=MR.w,h=MR.h,bottom=h-2;
    const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
    const samp=(x,y,o)=>{y=clamp(y,0,h-1);const y0=Math.floor(y),y1=Math.min(h-1,y0+1),f=y-y0,i0=(y0*w+x)*4,i1=(y1*w+x)*4;
      out[o]=src[i0]+(src[i1]-src[i0])*f;out[o+1]=src[i0+1]+(src[i1+1]-src[i0+1])*f;out[o+2]=src[i0+2]+(src[i1+2]-src[i0+2])*f;out[o+3]=255;};
    for(let x=0;x<w;x++){
      const X=MR.x+x,dx=(X-512)/half;
      const wOpen=Math.abs(dx)>=1?0:Math.pow(1-dx*dx,1.15);           // abertura: lente, fecha nos cantos
      const wJaw=1-smoothstep(.7,1.35,Math.abs(dx));                 // queixo: mais largo e suave
      const L=lipY(clamp(X,444,580))-MR.y,dOpen=D*wOpen,dJaw=D*Math.max(wOpen,wJaw*.85),u=U*wOpen;
      const top=L-u,bot=L+dOpen;
      for(let y=0;y<h;y++){const o=(y*w+x)*4;
        if(y<top){const k=1-smoothstep(top-18,top,y);samp(x,y+u*(1-k),o);}            // lábio de cima sobe
        else if(y>=bot){const k=y<bot+20?1:1-smoothstep(bot+20,bottom,y);samp(x,y-(dOpen+(dJaw-dOpen)*smoothstep(bot,bot+20,y))*k,o);} // lábio de baixo e queixo descem
        else{ // interior da boca
          const g=bot-top,t=(y-top)/Math.max(g,1e-3),edge=Math.min(1,(y-top+.5)*.8,(bot-y+.5)*.8,wOpen*3.5);
          let r=92-46*Math.sin(t*Math.PI),gg=36-20*Math.sin(t*Math.PI),b=44-22*Math.sin(t*Math.PI);
          if(g>6&&t<.4&&wOpen>.3){const k=smoothstep(.04,.18,t)*(1-smoothstep(.28,.4,t))*smoothstep(.3,.7,wOpen)*smoothstep(6,11,g)*.8*(1-.6*rnd_);r+=(196-r)*k;gg+=(184-gg)*k;b+=(184-b)*k;}
          if(t>.7){const k=smoothstep(.7,1,t)*.55;r+=(150-r)*k;gg+=(62-gg)*k;b+=(74-b)*k;}
          samp(x,y,o);const a=clamp(edge,0,1);out[o]=out[o]*(1-a)+r*a;out[o+1]=out[o+1]*(1-a)+gg*a;out[o+2]=out[o+2]*(1-a)+b*a;}
      }
    }
    mc.putImageData(MOUT,0,0);f.drawImage(MC,MR.x,MR.y);
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
    const an=window.cwHostAnalyser; // [site] MP3 da voz neural tocando: a boca segue o volume real, sílaba por sílaba
    let shapeGoal=0;
    if(S.talking&&an&&an.fftSize){
      // [v40] volume do som agora (forma de onda, sem a suavização do analisador)
      if(!tbuf||tbuf.length!==an.fftSize)tbuf=new Float32Array(an.fftSize);
      if(an.getFloatTimeDomainData)an.getFloatTimeDomainData(tbuf);else{const b=new Uint8Array(an.fftSize);an.getByteTimeDomainData(b);for(let i=0;i<b.length;i++)tbuf[i]=(b[i]-128)/128;}
      let sum=0;for(let i=0;i<tbuf.length;i++)sum+=tbuf[i]*tbuf[i];const rms=Math.sqrt(sum/tbuf.length);
      AU.peak=Math.max(rms,AU.peak*Math.exp(-dt/2.5),.02);                       // volume de referência da própria fala
      const n=clamp((rms/AU.peak-.22)/.78,0,1);
      AU.fast=lerp(AU.fast,n,1-Math.exp(-dt*(n>AU.fast?45:32)));AU.slow=lerp(AU.slow,AU.fast,1-Math.exp(-dt*3));
      const onset=Math.max(0,AU.fast-AU.slow);                                   // início de sílaba: abre mais
      S.target=clamp(Math.pow(AU.fast,1.8)*.85+onset*.55,0,1);                    // contraste: vogal abre, consoante quase fecha
      // forma da boca pelo timbre: som mais grave (o/u) arredonda, mais agudo (i/e) estica
      if(an.frequencyBinCount){if(an.smoothingTimeConstant>.4)an.smoothingTimeConstant=.35;if(!freq||freq.length!==an.frequencyBinCount)freq=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(freq);
        const hz=(an.context?an.context.sampleRate:48000)/an.fftSize;let lo=0,hi=0;for(let i=Math.round(250/hz);i<Math.round(900/hz);i++)lo+=freq[i];for(let i=Math.round(1400/hz);i<Math.round(3200/hz);i++)hi+=freq[i];
        const r=hi/(lo+1)*(900-250)/(3200-1400);if(n>.2)AU.shape=lerp(AU.shape,clamp((.55-r)*2.2,-1,1),1-Math.exp(-dt*10));}
      shapeGoal=AU.shape;
    } else if(S.talking){
      const p=pulseNow(now);
      if(p){S.target=p.v;shapeGoal=p.shape;}
      else S.target=pulses.length?.04:Math.max(.06,.12+.5*Math.pow(Math.max(0,Math.sin(S.t*Math.PI*2*4.6)),1.4)*(.6+.4*Math.sin(S.t*2.1))); // sem palavras da voz: ritmo silábico (~4,6/s) que fecha entre sílabas
    }
    S.shape=lerp(S.shape||0,S.talking?shapeGoal:0,1-Math.exp(-dt*12));
    if(!S.talking)S.target=Math.max(0,S.target-dt*3);
    S.mouth=lerp(S.mouth,S.target,1-Math.exp(-dt*(S.target>S.mouth?30:20)));
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
    drawBrows(S.browCur);drawBlink(E[0],bk);drawBlink(E[1],bk);drawMouth(CFG.mouthTest!=null?+CFG.mouthTest:clamp(S.mouth,0,1),CFG.shapeTest!=null?+CFG.shapeTest:S.shape); // mouthTest: só para conferir (0 a 1)
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
    state:()=>({ready:ready>=3,rig:'v8.3',images:{foto:!!img.naturalWidth,olhosFechados:closed.ok,boca:!!MSRC},talking:S.talking,mouth:+S.mouth.toFixed(3),shape:+(S.shape||0).toFixed(2),syllableMs:Math.round(sylMs),gesture:S.gesture,breath:CFG.breathAmount,life:CFG.life,
      head:{yaw:+S.hp.yaw.toFixed(2),pitch:+S.hp.pitch.toFixed(2),roll:+S.hp.roll.toFixed(2)},brows:+(S.browCur||0).toFixed(2),reducedMotion:!!reduce}), // [site]
    gestures:['nod','shake','lean','wave','present','pointLeft','pointRight','openArms','shrug','thumbsUp','headsetTouch'],emotes:['neutral','happy','surprised','thinking','wink'],presets:['calm','energetic','dj'],landmarks:{eyes:E,mouth:M,jaw:J,brows:BROWS,head:HEAD,pivot:PIV}};
})();
