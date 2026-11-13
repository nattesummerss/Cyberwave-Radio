/* ===== Cyberwave Radio – ANDRA-18 Rig 2.5D =====
 * Anima a host em tempo real a partir da fala (Web Speech API) ou de um AnalyserNode.
 * - Boca/mandíbula: abertura por sílaba (vogais abrem mais, m/b/p fecham)
 * - Cabeça: micro-movimentos contínuos + ênfase no início de cada palavra
 * - Olhos: piscar aleatório, olhar que "passeia", respiração sutil
 * Depende de: <img id="cw-host-img"> (fonte) dentro de #cw-host .cw-figure
 */
(function () {
  const root = document.getElementById('cw-host');
  const img = document.getElementById('cw-host-img');
  if (!root || !img) return;

  // ---------- Regiões do rosto (pixels da imagem original 1024x1536) ----------
  const R = {
    head: { x: 230, y: 0,   w: 620, h: 640, pivotX: 540, pivotY: 600 },
    jaw:  { x: 455, y: 462, w: 160, h: 130 },           // topo = lábio superior
    lip:  { x: 528, y: 489 },                           // linha dos lábios
    eyeL: { x: 405, y: 365, w: 75, h: 45 },
    eyeR: { x: 530, y: 310, w: 80, h: 50 },
  };

  // ---------- Canvas ----------
  const cv = document.createElement('canvas');
  cv.className = 'cw-rig';
  cv.setAttribute('aria-hidden', 'true');
  img.insertAdjacentElement('afterend', cv);
  img.style.display = 'none';
  const ctx = cv.getContext('2d');

  // Camadas pré-recortadas com máscara suave
  const layers = {};
  function cut(name, r, feather) {
    const c = document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    const x = c.getContext('2d');
    x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    x.globalCompositeOperation = 'destination-in';
    if (feather === 'bottom') {            // cabeça: só esmaece a base (pescoço)
      const g = x.createLinearGradient(0, r.h - 110, 0, r.h);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, r.w, r.h);
    } else {                               // demais: elipse suave
      const g = x.createRadialGradient(r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.25, r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, r.w, r.h);
    }
    layers[name] = c;
  }

  // ---------- Estado da animação ----------
  const S = {
    mouth: 0, mouthTarget: 0,
    headRot: 0, headX: 0, headY: 0, tRot: 0, tX: 0, tY: 0,
    blink: 0, nextBlink: 2000,
    eyeDX: 0, eyeDY: 0, tEyeX: 0, tEyeY: 0, nextGaze: 1500,
    nod: 0, talking: false, t: 0,
  };
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------- Visemas a partir do texto ----------
  const OPEN = { a: 1, á: 1, à: 1, ã: 0.9, â: 0.9, e: 0.7, é: 0.8, ê: 0.65, o: 0.75, ó: 0.8, ô: 0.7, õ: 0.7, i: 0.4, í: 0.4, u: 0.35, ú: 0.35, y: 0.4 };
  const CLOSED = /[mbp]/;
  let timeline = [];                    // [{at, open}]
  function scheduleWord(word, startMs, durMs) {
    const chars = word.toLowerCase().replace(/[^a-záàãâéêíóôõúç]/g, '');
    if (!chars.length) return;
    const step = durMs / chars.length;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const open = c in OPEN ? OPEN[c] : CLOSED.test(c) ? 0 : 0.18;
      timeline.push({ at: startMs + i * step, open });
    }
    timeline.push({ at: startMs + durMs, open: 0.05 });
  }
  function playTimeline() {
    const now = performance.now();
    while (timeline.length && timeline[0].at <= now) S.mouthTarget = timeline.shift().open;
  }

  // ---------- Integração com a fala ----------
  let speechStart = 0, fallbackTimer = null, msPerChar = 68;
  function bind(utt, text) {
    timeline = []; clearTimeout(fallbackTimer);
    msPerChar = 68 / (utt.rate || 1);
    let gotBoundary = false;
    utt.addEventListener('start', () => {
      S.talking = true; root.classList.add('is-talking'); speechStart = performance.now();
      // fallback: navegadores sem onboundary (Safari) → agenda o texto inteiro
      fallbackTimer = setTimeout(() => {
        if (gotBoundary) return;
        let t = performance.now();
        text.split(/\s+/).forEach(w => { const d = (w.length + 1) * msPerChar; scheduleWord(w, t, d * 0.85); t += d; });
      }, 250);
    });
    utt.addEventListener('boundary', e => {
      if (e.name && e.name !== 'word') return;
      gotBoundary = true;
      const word = text.slice(e.charIndex, e.charIndex + (e.charLength || (text.slice(e.charIndex).match(/^\S+/) || [''])[0].length));
      scheduleWord(word, performance.now(), Math.max(120, word.length * msPerChar * 0.85));
      S.nod = 1;                                                       // ênfase de cabeça
      S.tRot = (Math.random() - 0.5) * 2.2; S.tX = (Math.random() - 0.5) * 10;
    });
    const stop = () => { S.talking = false; root.classList.remove('is-talking'); timeline = []; S.mouthTarget = 0; };
    utt.addEventListener('end', stop); utt.addEventListener('error', stop);
  }

  // ---------- Loop de render ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now; S.t += dt;
    playTimeline();

    // boca: analyser externo (voz em áudio real) tem prioridade
    const an = window.cwHostAnalyser;
    if (an && S.talking) {
      const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d);
      let sum = 0; for (let i = 2; i < 40; i++) sum += d[i];
      S.mouthTarget = Math.min(1, (sum / 38 / 255) * 2.4);
    }
    S.mouth = lerp(S.mouth, S.mouthTarget, 1 - Math.pow(0.0005, dt / 1000) ** 0.08);

    // cabeça: deriva lenta + ênfase + respiração
    if (Math.random() < dt / 2600) { S.tRot = (Math.random() - 0.5) * (S.talking ? 2.6 : 1.2); S.tX = (Math.random() - 0.5) * 8; S.tY = (Math.random() - 0.5) * 5; }
    S.nod = lerp(S.nod, 0, 1 - Math.pow(0.02, dt / 1000));
    S.headRot = lerp(S.headRot, S.tRot, dt / 500);
    S.headX = lerp(S.headX, S.tX, dt / 500);
    S.headY = lerp(S.headY, S.tY + S.nod * 6, dt / 300);
    const breath = Math.sin(S.t / 2300) * 3;

    // piscar
    S.nextBlink -= dt;
    if (S.nextBlink <= 0) { S.blink = 1; S.nextBlink = 2200 + Math.random() * 3800; }
    S.blink = Math.max(0, S.blink - dt / 110);
    const lid = S.blink > 0.5 ? (1 - S.blink) * 2 : S.blink * 2;  // 0→1→0 em ~220ms

    // olhar
    S.nextGaze -= dt;
    if (S.nextGaze <= 0) { S.tEyeX = (Math.random() - 0.5) * 6; S.tEyeY = (Math.random() - 0.5) * 3; S.nextGaze = 900 + Math.random() * 2500; }
    S.eyeDX = lerp(S.eyeDX, S.tEyeX, dt / 120); S.eyeDY = lerp(S.eyeDY, S.tEyeY, dt / 120);

    // ---- desenho ----
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save(); ctx.translate(0, breath);              // corpo respira
    ctx.drawImage(img, 0, 0);

    // cabeça
    const H = R.head;
    ctx.save();
    ctx.translate(H.pivotX + S.headX, H.pivotY + S.headY);
    ctx.rotate(S.headRot * Math.PI / 180);
    ctx.translate(-H.pivotX, -H.pivotY);
    ctx.drawImage(layers.head, H.x, H.y);

    // olhos (olhar)
    ctx.drawImage(layers.eyeL, R.eyeL.x + S.eyeDX, R.eyeL.y + S.eyeDY);
    ctx.drawImage(layers.eyeR, R.eyeR.x + S.eyeDX, R.eyeR.y + S.eyeDY);
    // pálpebras (pele logo acima do olho, esticada para baixo)
    if (lid > 0.02) {
      for (const e of [R.eyeL, R.eyeR]) {
        ctx.drawImage(img, e.x, e.y - 14, e.w, 14, e.x, e.y - 2, e.w, 4 + lid * (e.h + 2));
      }
    }

    // mandíbula / boca
    const J = R.jaw, open = S.mouth;
    ctx.drawImage(layers.jaw, 0, 0, J.w, J.h, J.x, J.y, J.w, J.h * (1 + open * 0.26));
    if (open > 0.06) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(R.lip.x, R.lip.y + open * 9, 34 * Math.min(1, 0.55 + open * 0.6), 2 + open * 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(38,8,18,0.92)'; ctx.fill();
      ctx.beginPath();                                  // brilho dos dentes
      ctx.ellipse(R.lip.x, R.lip.y + open * 3, 22, 1.5 + open * 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,240,240,0.75)'; ctx.fill();
      ctx.restore();
    }
    ctx.restore(); ctx.restore();
    requestAnimationFrame(frame);
  }

  function init() {
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cut('head', R.head, 'bottom'); cut('jaw', R.jaw); cut('eyeL', R.eyeL); cut('eyeR', R.eyeR);
    requestAnimationFrame(frame);
  }
  if (img.complete && img.naturalWidth) init(); else img.addEventListener('load', init);

  // API para host.js e para integrações externas
  window.CyberwaveRig = {
    bind,
    setMouth: v => { S.mouthTarget = Math.max(0, Math.min(1, v)); },
    setTalking: v => { S.talking = !!v; root.classList.toggle('is-talking', !!v); },
  };
})();
