/* ANDRA-18 — rig frontal calibrado para assets/andra18.png (1024x1536, zoom 1.5x já aplicado)
 * API: Andra18.mount(selector, options) · speak(text) · emote(name) · gesture(name)
 *      setTrack(title, artist) · lookAt(x,y) · setTalking(bool) · destroy()
 */
(function (global) {
  'use strict';
  const LANDMARKS = Object.freeze({
    size:{w:1024,h:1536},
    face:{x:317,y:362,w:394,h:394},
    eyeL:{x:394,y:473,w:85,h:85,cx:436.5,cy:515.5},
    eyeR:{x:550,y:481,w:77,h:77,cx:588.5,cy:519.5},
    mouth:{x:438,y:628,w:152,h:72,cx:514,cy:660},
    jaw:{x:412,y:606,w:204,h:120}
  });
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  let active=null;

  class Rig {
    constructor(host, options={}) {
      this.host=host; this.options=options; this.destroyed=false; this.t=0; this.last=0;
       this.talking=false; this.manualMouth=0; this.mouth=0; this.blink=0; this.nextBlink=1.4;
      this.gaze={x:0,y:0,tx:0,ty:0}; this.nextSaccade=.8; this.caption='Pronta para entrar no ar.';
      this.state='idle'; this.gestureName=''; this.gestureT=0; this.utterance=null;
      host.classList.add('andra18-stage'); host.innerHTML='';
      this.canvas=document.createElement('canvas'); this.canvas.width=LANDMARKS.size.w; this.canvas.height=LANDMARKS.size.h;
      this.ctx=this.canvas.getContext('2d',{alpha:false}); host.appendChild(this.canvas);
      this.hud=document.createElement('div'); this.hud.className='andra18-hud';
      this.hud.innerHTML='<div class="andra18-live">ON AIR</div><div class="andra18-eq">'+('<i></i>'.repeat(9))+'</div><div class="andra18-caption"><strong>ANDRA-18 • CYBERWAVE RADIO</strong><span></span></div>';
      host.appendChild(this.hud); this.captionEl=this.hud.querySelector('.andra18-caption span'); this.bars=[...this.hud.querySelectorAll('.andra18-eq i')];
      this.img=new Image(); this.img.decoding='async'; this.img.src=options.image||'assets/andra18.png';
      this.closed=new Image(); this.closed.decoding='async'; this.closed.src=options.closedImage||'assets/andra18_closed.png';
       this.visemes=new Image(); this.visemes.decoding='async'; this.visemes.src=options.mouthImage||'assets/mouth_visemes.png';
       this.loaded=0; const ready=()=>{ if(++this.loaded===3){this.ready=true;requestAnimationFrame(t=>this.frame(t));} };
       this.img.onload=ready; this.closed.onload=ready; this.visemes.onload=ready;
       this.img.onerror=this.closed.onerror=this.visemes.onerror=()=>{ this.captionEl.textContent='Não foi possível carregar os assets da ANDRA-18.'; };
      this.onPointer=e=>{const r=host.getBoundingClientRect(); this.lookAt((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);};
      host.addEventListener('pointermove',this.onPointer,{passive:true});
      this.onTrack=e=>{const d=e.detail||{}; this.setTrack(d.title||'',d.artist||'');}; document.addEventListener('cw:trackchange',this.onTrack);
      this.setCaption(this.caption);
    }
    setCaption(text){this.caption=String(text||''); if(this.captionEl)this.captionEl.textContent=this.caption;}
    lookAt(x,y){this.gaze.tx=clamp((x-.5)*2,-1,1);this.gaze.ty=clamp((y-.5)*2,-1,1);}
    blinkNow(){this.blink=1;}
    setTalking(v){this.talking=!!v;this.host.dataset.state=this.talking?'talking':'idle';if(!v)this.manualMouth=0;}
     setMouth(v){this.manualMouth=clamp(+v||0,0,.78);}
    gesture(name){this.gestureName=name||'nod';this.gestureT=0;return this;}
     emote(name){ if(name==='wink')this.blink=1; else if(name==='surprised'){this.manualMouth=.72;setTimeout(()=>this.manualMouth=0,550);} else if(name==='happy')this.gesture('nod'); return this; }
    setTrack(title,artist){if(!title)return;this.setCaption('Agora: '+(artist?artist+' — ':'')+title);this.gesture('nod');}
    speak(text){
      text=String(text||'').trim(); if(!text)return; this.setCaption(text);
      const synth=global.speechSynthesis; if(!synth){this.fakeTalk(text.length*62);return;}
      synth.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='pt-BR';u.rate=1.02;u.pitch=1.04;
      const voices=synth.getVoices();u.voice=voices.find(v=>/^pt-BR/i.test(v.lang)&&/female|feminin|francisca|luciana|maria|camila|thalita/i.test(v.name))||voices.find(v=>/^pt/i.test(v.lang))||null;
      u.onstart=()=>this.setTalking(true);u.onend=u.onerror=()=>this.setTalking(false);
       u.onboundary=()=>{this.manualMouth=.18+Math.random()*.45;setTimeout(()=>this.manualMouth=.06,75);};
      this.utterance=u;synth.speak(u);
    }
    fakeTalk(ms){this.setTalking(true);clearTimeout(this.fakeTimer);this.fakeTimer=setTimeout(()=>this.setTalking(false),ms);}
    drawBlink(e,k){
      if(k<=.01)return;const c=this.ctx,close=smooth(clamp(k,0,1));
      c.save();c.beginPath();c.ellipse(e.cx,e.cy,e.w*.53,e.h*.40,0,0,Math.PI*2);c.clip();
      c.globalAlpha=close;c.drawImage(this.closed,0,0,LANDMARKS.size.w,LANDMARKS.size.h);c.restore();
    }
     drawMouth(open){
       if(open<.035)return;
       // Seis visemas derivados dos lábios reais da still. Não há elipses pintadas
       // nem uma segunda boca: apenas a textura original, deformada e mesclada.
       const c=this.ctx,p={x:414,y:598,w:200,h:126},maxOpen=.78;
       const q=clamp(open/maxOpen*4,0,4),a=Math.floor(q),b=Math.min(5,a+1),mix=q-a;
       c.save();c.globalAlpha=1-mix;c.drawImage(this.visemes,a*p.w,0,p.w,p.h,p.x,p.y,p.w,p.h);
       if(mix>.01){c.globalAlpha=mix;c.drawImage(this.visemes,b*p.w,0,p.w,p.h,p.x,p.y,p.w,p.h);}c.restore();
    }
    frame(now){
      if(this.destroyed)return;const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;this.t+=dt;
      this.nextBlink-=dt;if(this.nextBlink<=0){this.blink=1;this.nextBlink=2.1+Math.random()*3.5;}
      if(this.blink>0)this.blink=Math.max(0,this.blink-dt/0.15);
      this.nextSaccade-=dt;if(this.nextSaccade<=0){this.gaze.tx=(Math.random()-.5)*.32;this.gaze.ty=(Math.random()-.5)*.16;this.nextSaccade=.8+Math.random()*2.4;}
      this.gaze.x=lerp(this.gaze.x,this.gaze.tx,1-Math.exp(-dt*8));this.gaze.y=lerp(this.gaze.y,this.gaze.ty,1-Math.exp(-dt*8));
      if(this.gestureName){this.gestureT+=dt;if(this.gestureT>1.1){this.gestureName='';this.gestureT=0;}}
      const nod=this.gestureName==='nod'?Math.sin(this.gestureT*Math.PI*2)*Math.sin(Math.min(1,this.gestureT)*Math.PI)*2.2:0;
       const breath=Math.sin(this.t*1.48);const sway=Math.sin(this.t*.63)*.55;
       const target=this.talking?Math.max(this.manualMouth,.10+.55*(.5+.5*Math.sin(this.t*26.4))*(.45+.55*(.5+.5*Math.sin(this.t*17.3)))):this.manualMouth;
      this.mouth=lerp(this.mouth,target,1-Math.exp(-dt*18));if(this.manualMouth>0)this.manualMouth=Math.max(0,this.manualMouth-dt*2.8);
      const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1024,1536);
       c.save();c.translate(sway,nod-breath*1.7);c.translate(512,1080);c.scale(1+breath*.0011,1+breath*.0015);c.translate(-512,-1080);c.drawImage(this.img,0,0,1024,1536);
      // olhos permanecem nas coordenadas da imagem; o movimento é mínimo e o blink cobre exatamente cada olho.
      const blinkPhase=this.blink>.5?(1-this.blink)*2:this.blink*2;this.drawBlink(LANDMARKS.eyeL,blinkPhase);this.drawBlink(LANDMARKS.eyeR,blinkPhase);
      this.drawMouth(this.mouth);c.restore();
      this.bars.forEach((b,i)=>{const h=this.talking?20+this.mouth*62+Math.sin(this.t*12+i)*12:8+Math.sin(this.t*2+i*.8)*5;b.style.height=clamp(h,5,96)+'%';});
      requestAnimationFrame(t=>this.frame(t));
    }
    destroy(){this.destroyed=true;clearTimeout(this.fakeTimer);this.host.removeEventListener('pointermove',this.onPointer);document.removeEventListener('cw:trackchange',this.onTrack);if(this.utterance&&global.speechSynthesis)global.speechSynthesis.cancel();this.host.innerHTML='';}
  }

  const api={
    landmarks:LANDMARKS,
    mount(target,options){const el=typeof target==='string'?document.querySelector(target):target;if(!el)throw new Error('ANDRA-18: contêiner não encontrado');if(active)active.destroy();active=new Rig(el,options);return api;},
    speak:t=>active&&active.speak(t), emote:n=>active&&active.emote(n), gesture:n=>active&&active.gesture(n),
    setTrack:(t,a)=>active&&active.setTrack(t,a), lookAt:(x,y)=>active&&active.lookAt(x,y), setTalking:v=>active&&active.setTalking(v),
    setMouth:v=>active&&active.setMouth(v), blink:()=>active&&active.blinkNow(), destroy:()=>{if(active)active.destroy();active=null;}
  };
  global.Andra18=api;
})(window);
