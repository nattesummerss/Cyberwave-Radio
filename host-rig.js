/* ===== Cyberwave Radio – ANDRA-18 Rig 2.5D v3 =====
 * Animação procedural em tempo real (canvas, sem bibliotecas).
 * Camadas: corpo → braço esquerdo (mic) → cabeça (olhos, sobrancelhas, boca) → braço direito → mão direita.
 * Gestos: beats de mão sincronizados com palavras, "apresentar" (mão avança), "ajustar headset",
 * balanço de ombros, cabeça com rotação/inclinação ampla, poses livres em repouso.
 */
(function () {
  const root = document.getElementById('cw-host');
  const img = document.getElementById('cw-host-img');
  if (!root || !img) return;

  // ---------- Regiões (pixels da imagem 1024x1536) ----------
  const R = {
    head:  { x: 200, y: 0, w: 680, h: 660, pivotX: 540, pivotY: 610, mask: 'bottom' },
    jaw:   { x: 448, y: 456, w: 176, h: 140 },
    lip:   { x: 528, y: 489 },
    eyeL:  { x: 400, y: 358, w: 86, h: 56 },
    eyeR:  { x: 524, y: 303, w: 92, h: 62 },
    browL: { x: 396, y: 330, w: 96, h: 30 },
    browR: { x: 520, y: 272, w: 100, h: 34 },
    bodyPivot: { x: 560, y: 1500 },
    // braço direito (lado direito da tela, estendido para a câmera)
    armR:  { poly: [[770,640],[1024,640],[1024,980],[900,1000],[800,940],[760,800]], pivot: [850, 740] },
    handR: { poly: [[880,880],[1024,900],[1024,1420],[780,1536],[540,1480],[520,1280],[690,1090],[820,960]], pivot: [905, 1030] },
    // braço esquerdo (segura/ajusta o microfone e o headset)
    armL:  { poly: [[0,560],[210,560],[300,630],[300,780],[262,900],[292,1150],[240,1210],[0,1210]], pivot: [220, 1000] },
  };

  // ---------- Intensidade (ajuste livre em CyberwaveRig.config) ----------
  const CFG = {
    headRotDeg: 7,  headShiftX: 36, headShiftY: 20, headTiltScale: 0.055,
    bodySwayDeg: 3.2, bodyShiftX: 28, bodyShiftY: 10, breathPx: 8,
    nodPx: 18, browRaisePx: 10,
    armRRotDeg: 9,  handRRotDeg: 14, handRScale: 0.10, handBeatDeg: 7,
    armLRotDeg: 5,  armLLiftPx: 18,
    layerOverscan: 1.035,                 // cobre o "fantasma" da camada original
    mouthMax: 1.0, syllableHz: 7.5,
    idleEveryMs: [800, 2000], talkEveryMs: [300, 800],
    gestureEveryMs: [1800, 4500],
  };

  // ---------- Canvas ----------
  const cv = document.createElement('canvas');
  cv.className = 'cw-rig'; cv.setAttribute('aria-hidden', 'true');
  img.insertAdjacentElement('afterend', cv); img.style.display = 'none';
  const ctx = cv.getContext('2d');
  const layers = {};

  function bbox(poly) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function cutRect(name, r, mode) {
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    const x = c.getContext('2d');
    x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    x.globalCompositeOperation = 'destination-in';
    const g = mode === 'bottom'
      ? x.createLinearGradient(0, r.h - 140, 0, r.h)
      : x.createRadialGradient(r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.3, r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, r.w, r.h);
    layers[name] = { c, x: r.x, y: r.y };
  }
  function cutPoly(name, def, feather = 14) {
    const b = bbox(def.poly);
    const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
    const x = c.getContext('2d');
    // máscara suavizada
    const m = document.createElement('canvas'); m.width = b.w; m.height = b.h;
    const mx = m.getContext('2d');
    if ('filter' in mx) mx.filter = `blur(${feather}px)`;
    mx.beginPath(); def.poly.forEach((p, i) => mx[i ? 'lineTo' : 'moveTo'](p[0] - b.x, p[1] - b.y)); mx.closePath();
    mx.fillStyle = '#000'; mx.fill();
    x.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    layers[name] = { c, x: b.x, y: b.y, pivot: def.pivot };
  }

  // ---------- Estado ----------
  const S = {
    t: 0, talking: false, energy: 0,
    mouth: 0, mouthTarget: 0,
    hRot: 0, hX: 0, hY: 0, hTilt: 0, tRot: 0, tX: 0, tY: 0, tTilt: 0, nod: 0,
    bRot: 0, bX: 0, bY: 0, tbRot: 0, tbX: 0, tbY: 0,
    brow: 0, tBrow: 0,
    blink: 0, nextBlink: 1800,
    eX: 0, eY: 0, teX: 0, teY: 0, nextGaze: 1200,
    nextPose: 1200, nextGesture: 2500,
    // braços
    aR: 0, taR: 0, hR: 0, thR: 0, hS: 0, thS: 0, beat: 0,
    aL: 0, taL: 0, aLy: 0, taLy: 0,
    gesture: null, gT: 0,
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

  // ---------- Visemas ----------
  const OPEN = { a: 1, á: 1, à: 1, ã: .9, â: .9, e: .7, é: .8, ê: .65, o: .75, ó: .8, ô: .7, õ: .7, i: .4, í: .4, u: .35, ú: .35, y: .4 };
  const CLOSED = /[mbp]/;
  let timeline = [];
  function scheduleWord(word, startMs, durMs) {
    const chars = word.toLowerCase().replace(/[^a-záàãâéêíóôõúç]/g, '');
    if (!chars.length) return;
    const step = durMs / chars.length;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      timeline.push({ at: startMs + i * step, open: c in OPEN ? OPEN[c] : CLOSED.test(c) ? 0 : 0.2 });
    }
    timeline.push({ at: startMs + durMs, open: 0.08 });
  }

  // ---------- Gestos ----------
  // cada gesto define alvos por fase; duração em ms
  const GESTURES = {
    present:   { dur: 1400, run: k => { S.thS = Math.sin(k * Math.PI) * 1.0; S.thR = -Math.sin(k * Math.PI) * 0.6; S.taR = Math.sin(k * Math.PI) * 0.5; } },
    sweep:     { dur: 1600, run: k => { S.taR = Math.sin(k * Math.PI * 2) * 0.9; S.thR = Math.sin(k * Math.PI * 2 + 0.6) * 1.0; } },
    adjustSet: { dur: 1500, run: k => { S.taL = -Math.sin(k * Math.PI) * 1.0; S.taLy = -Math.sin(k * Math.PI) * 1.0; S.tTilt = Math.sin(k * Math.PI) * CFG.headTiltScale * 0.8; } },
    shrug:     { dur: 900,  run: k => { S.tbY = -Math.sin(k * Math.PI) * 1.2; S.taR = Math.sin(k * Math.PI) * 0.4; S.taL = Math.sin(k * Math.PI) * 0.4; } },
    openPalm:  { dur: 1200, run: k => { S.thR = Math.sin(k * Math.PI) * 1.0; S.thS = Math.sin(k * Math.PI) * 0.5; S.taR = -Math.sin(k * Math.PI) * 0.4; } },
  };
  function startGesture(name) { S.gesture = GESTURES[name] || null; S.gT = 0; }
  function pickGesture(talking) {
    const pool = talking ? ['present', 'sweep', 'openPalm', 'present', 'shrug', 'adjustSet'] : ['adjustSet', 'shrug', 'sweep'];
    startGesture(pool[Math.floor(Math.random() * pool.length)]);
  }

  // ---------- Fala ----------
  let fallbackTimer = null, msPerChar = 68;
  function startTalk() { S.talking = true; root.classList.add('is-talking'); startGesture('present'); }
  function stopTalk() { S.talking = false; root.classList.remove('is-talking'); timeline = []; S.mouthTarget = 0; }
  function bind(utt, text) {
    timeline = []; clearTimeout(fallbackTimer);
    msPerChar = 68 / (utt.rate || 1); let gotBoundary = false;
    utt.addEventListener('start', () => {
      startTalk(); S.tBrow = 1; S.nod = 1;
      fallbackTimer = setTimeout(() => {
        if (gotBoundary) return;
        let t = performance.now();
        text.split(/\s+/).forEach(w => { const d = (w.length + 1) * msPerChar; scheduleWord(w, t, d * 0.85); t += d; });
      }, 250);
    });
    utt.addEventListener('boundary', e => {
      if (e.name && e.name !== 'word') return;
      gotBoundary = true;
      const len = e.charLength || (text.slice(e.charIndex).match(/^\S+/) || [''])[0].length;
      const word = text.slice(e.charIndex, e.charIndex + len);
      scheduleWord(word, performance.now(), Math.max(120, word.length * msPerChar * 0.85));
      S.nod = rnd(0.6, 1); S.beat = 1; newPose(true);                  // beat gesture a cada palavra
      if (word.length > 6 || /[!?]/.test(word)) { S.tBrow = 1; if (!S.gesture) startGesture(Math.random() < 0.5 ? 'present' : 'openPalm'); }
    });
    utt.addEventListener('end', stopTalk); utt.addEventListener('error', stopTalk);
  }

  function newPose(talking) {
    const k = talking ? 1 : 0.55;
    S.tRot = rnd(-1, 1) * CFG.headRotDeg * k;
    S.tX = rnd(-1, 1) * CFG.headShiftX * k;
    S.tY = rnd(-0.6, 0.6) * CFG.headShiftY * k;
    S.tTilt = rnd(-1, 1) * CFG.headTiltScale * k;
    S.tbRot = rnd(-1, 1) * CFG.bodySwayDeg * k;
    S.tbX = rnd(-1, 1) * CFG.bodyShiftX * k;
    S.tbY = rnd(-0.5, 0.5) * CFG.bodyShiftY * k;
    S.teX = rnd(-1, 1) * 7; S.teY = rnd(-1, 1) * 3;
    if (!S.gesture) { S.taR = rnd(-0.5, 0.5) * k; S.thR = rnd(-0.5, 0.5) * k; S.taL = rnd(-0.4, 0.4) * k; S.taLy = rnd(-0.3, 0.3) * k; S.thS = 0; }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now; S.t += dt;

    S.nextPose -= dt;
    if (S.nextPose <= 0) { newPose(S.talking); const r = S.talking ? CFG.talkEveryMs : CFG.idleEveryMs; S.nextPose = rnd(r[0], r[1]); }
    S.nextGesture -= dt;
    if (S.nextGesture <= 0 && !S.gesture) { pickGesture(S.talking); const r = CFG.gestureEveryMs; S.nextGesture = rnd(r[0], r[1]) * (S.talking ? 0.6 : 1.4); }
    if (S.gesture) { S.gT += dt; const k = Math.min(1, S.gT / S.gesture.dur); S.gesture.run(k); if (k >= 1) { S.gesture = null; S.thS = 0; } }

    // boca
    while (timeline.length && timeline[0].at <= now) S.mouthTarget = timeline.shift().open;
    const an = window.cwHostAnalyser;
    if (an && S.talking) {
      const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d);
      let sum = 0; for (let i = 2; i < 40; i++) sum += d[i];
      S.mouthTarget = Math.min(1, (sum / 38 / 255) * 2.6);
      if (S.mouthTarget > 0.55 && Math.random() < dt / 180) S.beat = 1;
    } else if (S.talking && !timeline.length) {
      const ph = (S.t / 1000) * CFG.syllableHz * Math.PI * 2;
      S.mouthTarget = Math.max(0, 0.5 + 0.5 * Math.sin(ph)) * rnd(0.6, 1);
    }
    S.mouth = smooth(S.mouth, S.mouthTarget * CFG.mouthMax, dt, S.mouthTarget > S.mouth ? 45 : 90);
    S.energy = smooth(S.energy, S.talking ? 1 : 0, dt, 400);

    // cabeça / corpo
    S.nod = smooth(S.nod, 0, dt, 220);
    S.hRot = smooth(S.hRot, S.tRot, dt, 380);
    S.hX = smooth(S.hX, S.tX, dt, 380);
    S.hY = smooth(S.hY, S.tY + S.nod * CFG.nodPx, dt, 200);
    S.hTilt = smooth(S.hTilt, S.tTilt, dt, 500);
    S.bRot = smooth(S.bRot, S.tbRot, dt, 850);
    S.bX = smooth(S.bX, S.tbX, dt, 850);
    S.bY = smooth(S.bY, S.tbY * CFG.bodyShiftY, dt, 500);
    S.brow = smooth(S.brow, S.tBrow, dt, 120); S.tBrow = smooth(S.tBrow, 0, dt, 260);
    const breath = Math.sin(S.t / 2100) * CFG.breathPx * (1 + S.energy * 0.4);
    const bob = Math.sin(S.t / 1000 * CFG.syllableHz * Math.PI) * 3 * S.energy * S.mouth;

    // braços
    S.beat = smooth(S.beat, 0, dt, 160);
    S.aR = smooth(S.aR, S.taR * CFG.armRRotDeg + S.beat * CFG.handBeatDeg * 0.4, dt, 260);
    S.hR = smooth(S.hR, S.thR * CFG.handRRotDeg + S.beat * CFG.handBeatDeg, dt, 150);
    S.hS = smooth(S.hS, S.thS * CFG.handRScale + S.beat * 0.025, dt, 180);
    S.aL = smooth(S.aL, S.taL * CFG.armLRotDeg, dt, 420);
    S.aLy = smooth(S.aLy, S.taLy * CFG.armLLiftPx, dt, 420);
    const armIdle = Math.sin(S.t / 1700) * 0.8;            // leve flutuação constante

    // piscar / olhar
    S.nextBlink -= dt;
    if (S.nextBlink <= 0) { S.blink = 1; S.nextBlink = rnd(1800, 5200); }
    S.blink = Math.max(0, S.blink - dt / 120);
    const lid = S.blink > 0.5 ? (1 - S.blink) * 2 : S.blink * 2;
    S.nextGaze -= dt;
    if (S.nextGaze <= 0) { S.teX = rnd(-1, 1) * 7; S.teY = rnd(-1, 1) * 3; S.nextGaze = rnd(700, 2200); }
    S.eX = smooth(S.eX, S.teX, dt, 110); S.eY = smooth(S.eY, S.teY, dt, 110);

    // ---- render ----
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(R.bodyPivot.x + S.bX, R.bodyPivot.y + breath + S.bY);
    ctx.rotate(S.bRot * Math.PI / 180);
    ctx.translate(-R.bodyPivot.x, -R.bodyPivot.y);
    ctx.drawImage(img, 0, 0);

    // braço esquerdo (mic/headset)
    drawLayer(layers.armL, S.aL + armIdle, 0, -S.aLy + Math.sin(S.t / 1500) * 2, 0);

    // cabeça
    const H = R.head;
    ctx.save();
    ctx.translate(H.pivotX + S.hX, H.pivotY + S.hY + bob);
    ctx.rotate(S.hRot * Math.PI / 180);
    ctx.scale(1 + S.hTilt, 1 - Math.abs(S.hTilt) * 0.3);
    ctx.translate(-H.pivotX, -H.pivotY);
    ctx.drawImage(layers.head.c, H.x, H.y);
    ctx.drawImage(layers.browL.c, R.browL.x, R.browL.y - S.brow * CFG.browRaisePx);
    ctx.drawImage(layers.browR.c, R.browR.x, R.browR.y - S.brow * CFG.browRaisePx);
    ctx.drawImage(layers.eyeL.c, R.eyeL.x + S.eX, R.eyeL.y + S.eY);
    ctx.drawImage(layers.eyeR.c, R.eyeR.x + S.eX, R.eyeR.y + S.eY);
    if (lid > 0.02) for (const e of [R.eyeL, R.eyeR]) ctx.drawImage(img, e.x, e.y - 16, e.w, 16, e.x, e.y - 2, e.w, 4 + lid * (e.h + 4));
    const J = R.jaw, open = S.mouth;
    ctx.drawImage(layers.jaw.c, 0, 0, J.w, J.h, J.x, J.y, J.w, J.h * (1 + open * 0.3));
    if (open > 0.05) {
      ctx.beginPath(); ctx.ellipse(R.lip.x, R.lip.y + open * 11, 36 * Math.min(1, 0.5 + open * 0.7), 2 + open * 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,8,20,0.93)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(R.lip.x, R.lip.y + open * 3.5, 24, 1.5 + open * 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248,242,242,0.8)'; ctx.fill();
    }
    ctx.restore();

    // braço direito: ombro → antebraço/mão (cadeia cinemática simples)
    const A = layers.armR, Hd = layers.handR;
    ctx.save();
    ctx.translate(A.pivot[0], A.pivot[1]); ctx.rotate((S.aR - armIdle) * Math.PI / 180); ctx.translate(-A.pivot[0], -A.pivot[1]);
    drawLayer(A, 0, 0, 0, 0);
    // mão herda rotação do ombro + própria rotação no punho + "aproxima" da câmera (escala)
    ctx.translate(Hd.pivot[0], Hd.pivot[1]);
    ctx.rotate(S.hR * Math.PI / 180);
    ctx.scale(1 + S.hS, 1 + S.hS);
    ctx.translate(-Hd.pivot[0], -Hd.pivot[1]);
    drawLayer(Hd, 0, 0, 0, 0);
    ctx.restore();

    ctx.restore(); // corpo
    requestAnimationFrame(frame);
  }

  function drawLayer(L, rotDeg, dx, dy, _) {
    ctx.save();
    const px = L.pivot ? L.pivot[0] : L.x + L.c.width / 2, py = L.pivot ? L.pivot[1] : L.y + L.c.height / 2;
    ctx.translate(px + dx, py + dy); ctx.rotate(rotDeg * Math.PI / 180); ctx.scale(CFG.layerOverscan, CFG.layerOverscan); ctx.translate(-px, -py);
    ctx.drawImage(L.c, L.x, L.y);
    ctx.restore();
  }

  function init() {
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cutRect('head', R.head, 'bottom'); cutRect('jaw', R.jaw); cutRect('eyeL', R.eyeL); cutRect('eyeR', R.eyeR);
    cutRect('browL', R.browL); cutRect('browR', R.browR);
    cutPoly('armR', R.armR, 16); cutPoly('handR', R.handR, 18); cutPoly('armL', R.armL, 16);
    newPose(false);
    requestAnimationFrame(frame);
  }
  if (img.complete && img.naturalWidth) init(); else img.addEventListener('load', init);

  window.CyberwaveRig = {
    bind,
    setMouth: v => { S.mouthTarget = Math.max(0, Math.min(1, v)); },
    setTalking: v => (v ? startTalk() : stopTalk()),
    gesture: startGesture,                 // CyberwaveRig.gesture('present'|'sweep'|'openPalm'|'adjustSet'|'shrug')
    config: CFG,
  };
})();
