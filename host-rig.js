/* ===== Cyberwave Radio – ANDRA-18 Rig 2.5D v5.1 "Human Motion" — pose A aberta =====
 * Princípios de animação aplicados em tempo real (canvas, sem libs):
 *  • Física de molas (massa/amortecimento) em todas as articulações → peso, overshoot e follow-through
 *  • Ruído orgânico contínuo (soma de senos incomensuráveis) em vez de poses aleatórias → nunca "robótico"
 *  • Antecipação antes de cada gesto e recuperação suave depois
 *  • Transferência de peso no quadril com contra-rotação natural da cabeça
 *  • Respiração que ergue ombros e peito; cabelo e mãos com atraso secundário
 *  • Microexpressões: sorriso assimétrico, sobrancelhas independentes, olhos com sacadas e fixação
 *  • Lipsync por visemas com coarticulação (transições suaves entre fonemas)
 *
 * API (window.CyberwaveRig): gesture(name) · emote(name) · lookAt(x,y) · follow(bool) · pose(preset)
 *   setTalking(bool) · setMouth(0..1) · bind(utterance,text) · config · gestures · emotes · presets
 * Página: data-cw-gesture / data-cw-emote / data-cw-say / data-cw-pose e evento 'cw:host' {cmd,arg}
 */
(function () {
  const root = document.getElementById('cw-host');
  const img = document.getElementById('cw-host-img');
  if (!root || !img) return;

  // ---------- Regiões (px da imagem 1024x1536) ----------
  const R = {
    head:  { x: 280, y: 0, w: 480, h: 470, pivotX: 525, pivotY: 440 },
    jaw:   { x: 440, y: 300, w: 170, h: 100 }, lip: { x: 526, y: 340 },
    eyeL:  { x: 432, y: 228, w: 68, h: 40 }, eyeR: { x: 548, y: 222, w: 70, h: 40 },
    browL: { x: 425, y: 195, w: 80, h: 33 }, browR: { x: 545, y: 190, w: 80, h: 32 },
    hairL: { poly: [[285,30],[400,30],[420,200],[435,330],[450,470],[290,480]], pivot: [350, 50] },
    hairR: { poly: [[600,300],[660,290],[670,470],[600,470]], pivot: [630, 290] },
    bodyPivot: { x: 512, y: 1500 }, chest: { x: 300, y: 480, w: 424, h: 500 },
    // braço esquerdo da tela: ombro → antebraço → mão (pivôs nas articulações)
    upL: { poly: [[180,515],[305,520],[305,700],[262,905],[148,905],[158,700]], pivot: [240, 570] },
    loL: { poly: [[55,875],[270,875],[262,1185],[45,1185]], pivot: [170, 900] },
    hdL: { poly: [[0,1145],[245,1145],[225,1420],[0,1420]], pivot: [120, 1170] },
    // braço direito da tela
    upR: { poly: [[725,515],[850,520],[882,700],[882,905],[768,905],[725,700]], pivot: [790, 570] },
    loR: { poly: [[765,875],[985,875],[1005,1185],[775,1185]], pivot: [870, 900] },
    hdR: { poly: [[795,1145],[1024,1145],[1024,1420],[815,1420]], pivot: [920, 1170] },
  };

  // ---------- Config ----------
  const CFG = {
    amp: 1,                       // multiplicador global de amplitude
    headRotDeg: 7, headShiftX: 34, headShiftY: 18, headTiltScale: .06,
    bodySwayDeg: 3, bodyShiftX: 26, weightShiftX: 22, breathPx: 7,
    nodPx: 18, browRaisePx: 11,
    upArmDeg: 16, loArmDeg: 26, handDeg: 20, armBeatDeg: 7, layerOverscan: 1.03,
    syllableHz: 7.5, gestureEveryMs: [2600, 6500],
    followCursor: true, followStrength: 1,
    // molas: [stiffness, damping] — menos damping = mais balanço
    springs: { head: [60, 9], body: [25, 7], arm: [45, 7.5], hand: [70, 7], hair: [90, 6], brow: [160, 16], mouth: [260, 22] },
  };
  const PRESETS = {
    calm:      { amp: .6, gestureEveryMs: [5000, 9500] },
    energetic: { amp: 1.35, gestureEveryMs: [1500, 3500] },
    dj:        { amp: 1.2, bodySwayDeg: 5, weightShiftX: 36, gestureEveryMs: [1200, 2600] },
  };

  // ---------- Utilidades ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const bump = k => Math.sin(clamp(k, 0, 1) * Math.PI);
  // curva com antecipação (pequeno recuo) + ação + recuperação
  const antic = k => k < .18 ? -.28 * Math.sin(k / .18 * Math.PI) : bump((k - .18) / .82);
  // ruído suave 1D (pseudo-Perlin): soma de senos com frequências irracionais
  const noise = (t, seed) => (Math.sin(t * 1.0 + seed) * .5 + Math.sin(t * 2.317 + seed * 1.7) * .3 + Math.sin(t * .473 + seed * 2.3) * .2);
  // mola crítica/subamortecida
  function Spring(k, c) { this.p = 0; this.v = 0; this.t = 0; this.k = k; this.c = c; }
  Spring.prototype.step = function (dt) { const h = Math.min(dt, .033); const a = this.k * (this.t - this.p) - this.c * this.v; this.v += a * h; this.p += this.v * h; return this.p; };
  const SP = n => new Spring(...CFG.springs[n]);

  // ---------- Camadas ----------
  const cv = document.createElement('canvas'); cv.className = 'cw-rig'; cv.setAttribute('aria-hidden', 'true');
  img.insertAdjacentElement('afterend', cv); img.style.display = 'none';
  const ctx = cv.getContext('2d'); const L = {};
  const bbox = p => { const xs = p.map(a => a[0]), ys = p.map(a => a[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
  function cutRect(n, r, mode) {
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; const x = c.getContext('2d');
    x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); x.globalCompositeOperation = 'destination-in';
    const g = mode === 'bottom' ? x.createLinearGradient(0, r.h - 120, 0, r.h) : x.createRadialGradient(r.w / 2, r.h / 2, Math.min(r.w, r.h) * .3, r.w / 2, r.h / 2, Math.max(r.w, r.h) * .62);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, r.w, r.h);
    L[n] = { c, x: r.x, y: r.y, pivot: [r.x + r.w / 2, r.y + r.h / 2] };
  }
  function cutPoly(n, def, feather = 14) {
    const b = bbox(def.poly); const c = document.createElement('canvas'); c.width = b.w; c.height = b.h; const x = c.getContext('2d');
    const m = document.createElement('canvas'); m.width = b.w; m.height = b.h; const mx = m.getContext('2d');
    if ('filter' in mx) mx.filter = `blur(${feather}px)`;
    mx.beginPath(); def.poly.forEach((p, i) => mx[i ? 'lineTo' : 'moveTo'](p[0] - b.x, p[1] - b.y)); mx.closePath(); mx.fillStyle = '#000'; mx.fill();
    x.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    L[n] = { c, x: b.x, y: b.y, pivot: def.pivot };
  }

  // ---------- Estado ----------
  const J = { // articulações com molas
    hRot: SP('head'), hX: SP('head'), hY: SP('head'), hTilt: SP('head'),
    bRot: SP('body'), bX: SP('body'), bY: SP('body'), weight: SP('body'),
    uL: SP('arm'), lL: SP('arm'), hdL: SP('hand'), uR: SP('arm'), lR: SP('arm'), hdR: SP('hand'),
    hairL: SP('hair'), hairR: SP('hair'), browL: SP('brow'), browR: SP('brow'), mouth: SP('mouth'), smile: SP('brow'),
  };
  const S = {
    t: 0, talking: false, energy: 0, mouthTarget: 0, visemeW: 0,
    nod: 0, shake: 0, beat: 0, browHold: 0, browHoldL: 0, browHoldR: 0, tBrowL: 0, tBrowR: 0, tSmile: 0, smileAsym: .35,
    blink: 0, nextBlink: 1800, winkR: 0, squint: 0,
    gazeX: 0, gazeY: 0, tGazeX: 0, tGazeY: 0, nextSaccade: 900,
    look: null, gesture: null, gT: 0, nextGesture: 3000, seed: Math.random() * 100,
    g: { uL: 0, lL: 0, hdL: 0, uR: 0, lR: 0, hdR: 0, hRot: 0, hTilt: 0, hY: 0, bY: 0, bRot: 0, gaze: 0 }, // offsets de gesto
  };

  // ---------- Visemas com coarticulação ----------
  const OPEN = { a: 1, á: 1, à: 1, ã: .9, â: .9, e: .7, é: .8, ê: .65, o: .75, ó: .8, ô: .7, õ: .7, i: .4, í: .4, u: .35, ú: .35, y: .4 };
  const WIDE = { i: 1, í: 1, e: .7, é: .7, ê: .6 }; const ROUND = { o: 1, ó: 1, ô: 1, u: 1, ú: 1 };
  let timeline = [];
  function scheduleWord(word, start, dur) {
    const ch = word.toLowerCase().replace(/[^a-záàãâéêíóôõúç]/g, ''); if (!ch.length) return;
    const step = dur / ch.length;
    for (let i = 0; i < ch.length; i++) { const c = ch[i]; timeline.push({ at: start + i * step, open: c in OPEN ? OPEN[c] : /[mbp]/.test(c) ? 0 : .18, w: (WIDE[c] || 0) - (ROUND[c] || 0) }); }
    timeline.push({ at: start + dur, open: .06, w: 0 });
  }

  // ---------- Gestos ----------
  const G = {
    wave:        { dur: 2000, run: k => { const a = antic(k); S.g.uR = a * 1.7; S.g.lR = a * 2.3; S.g.hdR = Math.sin(k * Math.PI * 7) * bump(k) * 1.4; S.g.hTilt = a * .35; S.tSmile = 1; } },
    present:     { dur: 1500, run: k => { const a = antic(k); S.g.uR = a * .9; S.g.lR = a * 1.3; S.g.hdR = -a * .6; S.g.hRot = -a * .45; S.g.bRot = -a * .3; } },
    pointLeft:   { dur: 1600, run: k => { const a = antic(k); S.g.uL = a * 1.2; S.g.lL = a * 1.6; S.g.hdL = a * .5; S.g.hRot = a * .6; S.g.gaze = -a; S.g.bRot = a * .35; } },
    pointRight:  { dur: 1600, run: k => { const a = antic(k); S.g.uR = a * 1.2; S.g.lR = a * 1.6; S.g.hdR = a * .5; S.g.hRot = -a * .6; S.g.gaze = a; S.g.bRot = -a * .35; } },
    openArms:    { dur: 1800, run: k => { const a = antic(k); S.g.uL = S.g.uR = a * 1.1; S.g.lL = S.g.lR = a * .9; S.g.hdL = S.g.hdR = a * .6; S.tBrowL = S.tBrowR = a; S.tSmile = 1; S.g.bY = -a * .4; } },
    shrug:       { dur: 1100, run: k => { const a = bump(k); S.g.bY = -a * 1.4; S.g.uL = S.g.uR = a * .55; S.g.lL = S.g.lR = a * .9; S.g.hdL = S.g.hdR = a * .8; S.tBrowL = S.tBrowR = a; S.g.hTilt = a * .5; S.g.hY = a * .3; } },
    thumbsUp:    { dur: 1400, run: k => { const a = antic(k); S.g.uR = a * 1.0; S.g.lR = a * 2.1; S.g.hdR = -a * .9; S.tSmile = 1; if (k > .3 && k < .34) S.nod = 1; } },
    headsetTouch:{ dur: 1800, run: k => { const a = antic(k); S.g.uR = a * 1.5; S.g.lR = a * 2.7; S.g.hdR = -a * 1.1; S.g.hTilt = -a * .6; S.g.hRot = a * .5; S.g.gaze = a * .5; } },
    nod:         { dur: 1000, run: k => { S.g.hY = Math.sin(k * Math.PI * 4) * bump(k) * .9; } },
    shake:       { dur: 1000, run: k => { S.shake = Math.sin(k * Math.PI * 4) * bump(k); } },
    lean:        { dur: 2200, run: k => { const a = bump(k); S.g.bY = -a * .5; S.g.hY = a * .4; S.g.hRot = a * .2; S.tSmile = .8; } },
  };
  const talkPool = ['present', 'openArms', 'pointRight', 'pointLeft', 'shrug', 'present', 'lean'];
  const idlePool = ['headsetTouch', 'shrug', 'nod', 'lean', 'wave'];
  function startGesture(name) { if (!G[name]) return false; S.gesture = G[name]; S.gT = 0; return true; }

  // ---------- Emoções ----------
  const EM = {
    neutral:   () => { S.tSmile = 0; S.browHoldL = S.browHoldR = 0; S.squint = 0; },
    happy:     () => { S.tSmile = 1; S.browHoldL = .4; S.browHoldR = .5; S.squint = .3; },
    surprised: () => { S.tSmile = .2; S.browHoldL = S.browHoldR = 1; S.squint = -.3; S.mouthTarget = .55; setTimeout(() => (S.mouthTarget = 0), 650); },
    thinking:  () => { S.tSmile = 0; S.browHoldL = .2; S.browHoldR = .8; S.g.hTilt = .6; S.tGazeX = 1.2; S.tGazeY = -1.1; },
    wink:      () => { S.winkR = 1; S.tSmile = 1; S.browHoldR = .6; },
  };
  let emoteTimer = null;
  function emote(name, ms = 2600) { (EM[name] || EM.neutral)(); clearTimeout(emoteTimer); if (name !== 'neutral') emoteTimer = setTimeout(EM.neutral, ms); }

  // ---------- Fala ----------
  let fallbackTimer = null, msPerChar = 68;
  function startTalk() { S.talking = true; root.classList.add('is-talking'); startGesture('present'); }
  function stopTalk() { S.talking = false; root.classList.remove('is-talking'); timeline = []; S.mouthTarget = 0; }
  function bind(utt, text) {
    timeline = []; clearTimeout(fallbackTimer); msPerChar = 68 / (utt.rate || 1); let gotB = false;
    utt.addEventListener('start', () => { startTalk(); S.tBrowL = S.tBrowR = 1; S.nod = 1;
      fallbackTimer = setTimeout(() => { if (gotB) return; let t = performance.now(); text.split(/\s+/).forEach(w => { const d = (w.length + 1) * msPerChar; scheduleWord(w, t, d * .85); t += d; }); }, 250); });
    utt.addEventListener('boundary', e => {
      if (e.name && e.name !== 'word') return; gotB = true;
      const len = e.charLength || (text.slice(e.charIndex).match(/^\S+/) || [''])[0].length; const word = text.slice(e.charIndex, e.charIndex + len);
      scheduleWord(word, performance.now(), Math.max(120, word.length * msPerChar * .85));
      S.nod = rnd(.4, 1); S.beat = Math.random() < .7 ? 1 : .4;
      if (word.length > 6 || /[!?]/.test(word)) { S.tBrowL = rnd(.6, 1); S.tBrowR = rnd(.6, 1); if (!S.gesture && Math.random() < .6) startGesture(talkPool[Math.floor(Math.random() * talkPool.length)]); }
      if (/[?]/.test(word)) S.g.hTilt = .5;
      if (/[.!]/.test(word)) S.tSmile = Math.max(S.tSmile, .6);
    });
    utt.addEventListener('end', stopTalk); utt.addEventListener('error', stopTalk);
  }

  // ---------- Interação ----------
  function lookAt(nx, ny) { S.look = { x: clamp(nx * 2 - 1, -1, 1), y: clamp(ny * 2 - 1, -1, 1) }; }
  window.addEventListener('pointermove', e => { if (CFG.followCursor) lookAt(e.clientX / innerWidth, e.clientY / innerHeight); }, { passive: true });
  root.addEventListener('pointerdown', () => { if (!S.talking) { startGesture(Math.random() < .5 ? 'wave' : 'nod'); emote('happy'); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { startGesture('wave'); emote('happy'); } });
  const CMDS = { gesture: a => startGesture(a), emote: a => emote(a), say: a => window.CyberwaveHost && CyberwaveHost.speak(a), pose: a => applyPreset(a), follow: a => (CFG.followCursor = a !== false && a !== 'false') };
  document.addEventListener('cw:host', e => { const d = e.detail || {}; CMDS[d.cmd] && CMDS[d.cmd](d.arg); });
  document.addEventListener('click', e => { const el = e.target.closest('[data-cw-gesture],[data-cw-emote],[data-cw-say],[data-cw-pose]'); if (!el) return;
    el.dataset.cwGesture && startGesture(el.dataset.cwGesture); el.dataset.cwEmote && emote(el.dataset.cwEmote); el.dataset.cwPose && applyPreset(el.dataset.cwPose); el.dataset.cwSay && CMDS.say(el.dataset.cwSay); });
  function applyPreset(name) { Object.assign(CFG, PRESETS[name] || {}); }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dtMs = Math.min(50, now - last); last = now; S.t += dtMs; const dt = dtMs / 1000, T = S.t / 1000, A = CFG.amp;
    for (const k in S.g) S.g[k] = 0;                       // offsets de gesto são recalculados por frame
    S.shake *= Math.exp(-dt * 6);

    // gestos
    S.nextGesture -= dtMs;
    if (S.nextGesture <= 0 && !S.gesture) { const p = S.talking ? talkPool : idlePool; startGesture(p[Math.floor(Math.random() * p.length)]); const r = CFG.gestureEveryMs; S.nextGesture = rnd(r[0], r[1]) * (S.talking ? .6 : 1.3); }
    if (S.gesture) { S.gT += dtMs; const k = Math.min(1, S.gT / S.gesture.dur); S.gesture.run(k); if (k >= 1) S.gesture = null; }

    // boca (visemas → mola)
    while (timeline.length && timeline[0].at <= now) { const v = timeline.shift(); S.mouthTarget = v.open; S.visemeW = v.w || 0; }
    const an = window.cwHostAnalyser;
    if (an && S.talking) { const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); let s = 0; for (let i = 2; i < 40; i++) s += d[i]; S.mouthTarget = clamp((s / 38 / 255) * 2.6, 0, 1); if (S.mouthTarget > .55 && Math.random() < dt * 6) S.beat = 1; }
    else if (S.talking && !timeline.length) S.mouthTarget = Math.max(0, .5 + .5 * Math.sin(T * CFG.syllableHz * Math.PI * 2)) * rnd(.6, 1);
    J.mouth.t = S.mouthTarget; const mouth = clamp(J.mouth.step(dt), 0, 1.1);
    S.energy += ((S.talking ? 1 : 0) - S.energy) * (1 - Math.exp(-dt * 2.5));
    J.smile.t = Math.max(S.tSmile, S.talking ? .3 : .08); const smile = J.smile.step(dt); S.tSmile += (0 - S.tSmile) * (1 - Math.exp(-dt * .5));

    // olhar: sacadas rápidas + fixação; cursor tem prioridade
    S.nextSaccade -= dtMs; if (S.nextSaccade <= 0) { S.tGazeX = rnd(-1, 1) * .7; S.tGazeY = rnd(-1, 1) * .4; S.nextSaccade = rnd(600, 2600); }
    let lx = 0, ly = 0; if (S.look && CFG.followCursor) { lx = S.look.x * CFG.followStrength; ly = S.look.y * CFG.followStrength; S.tGazeX = lx; S.tGazeY = ly * .6; }
    S.gazeX += (S.tGazeX + S.g.gaze * .8 - S.gazeX) * (1 - Math.exp(-dt * 22)); S.gazeY += (S.tGazeY - S.gazeY) * (1 - Math.exp(-dt * 22));

    // respiração e transferência de peso (ritmos lentos e irregulares)
    const breathPh = Math.sin(T * (2 * Math.PI / 3.6) + noise(T * .3, S.seed) * .6); const breath = breathPh * CFG.breathPx * (1 + S.energy * .5);
    J.weight.t = noise(T * .11, S.seed + 7) * CFG.weightShiftX * A; const weight = J.weight.step(dt);

    // corpo: ruído lento + gestos + peso
    J.bRot.t = (noise(T * .23, S.seed + 1) * CFG.bodySwayDeg * A) + S.g.bRot * 3 * A + weight * .08 + lx * 1.2;
    J.bX.t = noise(T * .19, S.seed + 2) * CFG.bodyShiftX * A + lx * 8;
    J.bY.t = S.g.bY * 12 * A;
    const bRot = J.bRot.step(dt), bX = J.bX.step(dt) + weight, bY = J.bY.step(dt);

    // cabeça: ruído médio + contra-rotação (compensa o corpo) + ênfases + cursor
    S.nod *= Math.exp(-dt * 5);
    J.hRot.t = noise(T * .5, S.seed + 3) * CFG.headRotDeg * A - bRot * .45 + S.g.hRot * 9 * A + S.shake * 7 - lx * 3;
    J.hX.t = noise(T * .41, S.seed + 4) * CFG.headShiftX * A + lx * 18 + S.shake * 12 + S.energy * noise(T * 2.1, S.seed + 9) * 6;
    J.hY.t = noise(T * .37, S.seed + 5) * CFG.headShiftY * A + S.nod * CFG.nodPx + S.g.hY * 16 * A + ly * 10 + breath * .25;
    J.hTilt.t = noise(T * .29, S.seed + 6) * CFG.headTiltScale * A + S.g.hTilt * .06 + lx * .02 - bRot * .004;
    const hRot = J.hRot.step(dt), hX = J.hX.step(dt), hY = J.hY.step(dt), hTilt = J.hTilt.step(dt);
    const bob = Math.sin(T * CFG.syllableHz * Math.PI) * 2.5 * S.energy * mouth;

    // sobrancelhas (independentes)
    J.browL.t = Math.max(S.tBrowL, S.browHoldL) + noise(T * .7, S.seed + 11) * .08; J.browR.t = Math.max(S.tBrowR, S.browHoldR) + noise(T * .7, S.seed + 12) * .08;
    const browL = J.browL.step(dt), browR = J.browR.step(dt); S.tBrowL *= Math.exp(-dt * 3.5); S.tBrowR *= Math.exp(-dt * 3.5);

    // braços: ruído + gestos + beat + respiração nos ombros
    S.beat *= Math.exp(-dt * 7); const idle = T * .33;
    J.uL.t = (noise(idle, S.seed + 21) * .35 + S.g.uL) * CFG.upArmDeg * A - weight * .04;
    J.lL.t = (noise(idle, S.seed + 22) * .3 + S.g.lL) * CFG.loArmDeg * A + S.beat * CFG.armBeatDeg * .5;
    J.hdL.t = (noise(idle * 1.4, S.seed + 23) * .35 + S.g.hdL) * CFG.handDeg * A;
    J.uR.t = (noise(idle, S.seed + 24) * .35 + S.g.uR) * CFG.upArmDeg * A + weight * .04;
    J.lR.t = (noise(idle, S.seed + 25) * .3 + S.g.lR) * CFG.loArmDeg * A + S.beat * CFG.armBeatDeg;
    J.hdR.t = (noise(idle * 1.4, S.seed + 26) * .35 + S.g.hdR) * CFG.handDeg * A + S.beat * 3;
    const uL = J.uL.step(dt), lL = J.lL.step(dt), hdL = J.hdL.step(dt), uR = J.uR.step(dt), lR = J.lR.step(dt), hdR = J.hdR.step(dt);

    // cabelo: segue a cabeça com atraso (mola) → movimento secundário
    J.hairL.t = -(hRot * .6 + J.hX.v * .01); J.hairR.t = -(hRot * .5 + J.hX.v * .008);
    const hairL = J.hairL.step(dt), hairR = J.hairR.step(dt);

    // pálpebras
    S.nextBlink -= dtMs; if (S.nextBlink <= 0) { S.blink = 1; S.nextBlink = Math.random() < .2 ? 300 : rnd(1800, 5500); } // piscadas duplas ocasionais
    S.blink = Math.max(0, S.blink - dt / .13); S.winkR = Math.max(0, S.winkR - dt / .7);
    const lid = S.blink > .5 ? (1 - S.blink) * 2 : S.blink * 2;
    const sq = Math.max(0, S.squint) + Math.max(0, -S.gazeY) * .12 + smile * .12;
    const lidL = Math.max(lid, sq), lidR = Math.max(lid, sq, S.winkR > 0 ? Math.min(1, S.winkR * 1.6) : 0);

    // ---------- render ----------
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save(); ctx.translate(R.bodyPivot.x + bX, R.bodyPivot.y + bY + breath); ctx.rotate(bRot * Math.PI / 180); ctx.translate(-R.bodyPivot.x, -R.bodyPivot.y);
    ctx.drawImage(L.body, 0, 0);
    // peito sobe com a respiração (escala vertical sutil ancorada na cintura)
    ctx.save(); ctx.translate(R.chest.x + R.chest.w / 2, R.chest.y + R.chest.h); ctx.scale(1 + breathPh * .004, 1 + breathPh * .012); ctx.translate(-(R.chest.x + R.chest.w / 2), -(R.chest.y + R.chest.h)); ctx.drawImage(L.chest.c, R.chest.x, R.chest.y); ctx.restore();

    // braços (ombros sobem com a respiração)
    const shoulderLift = -breathPh * 2.5;
    drawArm(L.upL, L.loL, L.hdL, uL, lL, hdL, shoulderLift);
    drawArm(L.upR, L.loR, L.hdR, -uR, -lR, -hdR, shoulderLift);

    // cabeça
    const H = R.head;
    ctx.save(); ctx.translate(H.pivotX + hX, H.pivotY + hY + bob); ctx.rotate(hRot * Math.PI / 180);
    ctx.scale(1 + hTilt, 1 - Math.abs(hTilt) * .3); ctx.translate(-H.pivotX, -H.pivotY);
    ctx.drawImage(L.head.c, H.x, H.y);
    rot(L.hairL, hairL); rot(L.hairR, hairR);
    ctx.drawImage(L.browL.c, R.browL.x, R.browL.y - browL * CFG.browRaisePx);
    ctx.drawImage(L.browR.c, R.browR.x, R.browR.y - browR * CFG.browRaisePx);
    const ex = S.gazeX * 8, ey = S.gazeY * 5;
    ctx.drawImage(L.eyeL.c, R.eyeL.x + ex, R.eyeL.y + ey); ctx.drawImage(L.eyeR.c, R.eyeR.x + ex, R.eyeR.y + ey);
    if (lidL > .02) ctx.drawImage(img, R.eyeL.x, R.eyeL.y - 14, R.eyeL.w, 14, R.eyeL.x, R.eyeL.y - 2, R.eyeL.w, 4 + lidL * (R.eyeL.h + 4));
    if (lidR > .02) ctx.drawImage(img, R.eyeR.x, R.eyeR.y - 14, R.eyeR.w, 14, R.eyeR.x, R.eyeR.y - 2, R.eyeR.w, 4 + lidR * (R.eyeR.h + 4));
    // boca: largura por visema (i = largo, o/u = arredondado), sorriso assimétrico
    const Jw = R.jaw, wide = 1 + S.visemeW * .08 * mouth + smile * .09;
    ctx.save(); ctx.translate(R.lip.x, R.lip.y); ctx.scale(wide, 1); ctx.rotate(smile * S.smileAsym * .02); ctx.translate(-R.lip.x, -R.lip.y);
    ctx.drawImage(L.jaw.c, 0, 0, Jw.w, Jw.h, Jw.x, Jw.y - smile * 3, Jw.w, Jw.h * (1 + mouth * .32)); ctx.restore();
    if (mouth > .05) {
      const rw = 30 * (.5 + mouth * .7 + smile * .2) * (1 + S.visemeW * .25) / (1 + Math.max(0, -S.visemeW) * .5);
      ctx.beginPath(); ctx.ellipse(R.lip.x, R.lip.y + 4 + mouth * 10, rw, 2 + mouth * 12, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,8,20,.93)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(R.lip.x, R.lip.y + 3 + mouth * 3, rw * .7, 1.5 + mouth * 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(248,242,242,.8)'; ctx.fill();
    } else if (smile > .3) { ctx.beginPath(); ctx.strokeStyle = `rgba(90,30,40,${smile * .35})`; ctx.lineWidth = 2; ctx.moveTo(R.lip.x - 24, R.lip.y + 6); ctx.quadraticCurveTo(R.lip.x + smile * S.smileAsym * 6, R.lip.y + 6 + smile * 9, R.lip.x + 24, R.lip.y + 6); ctx.stroke(); }
    ctx.restore(); ctx.restore();
    requestAnimationFrame(frame);
  }

  function rot(Lr, deg) { ctx.save(); ctx.translate(Lr.pivot[0], Lr.pivot[1]); ctx.rotate(deg * Math.PI / 180); ctx.translate(-Lr.pivot[0], -Lr.pivot[1]); ctx.drawImage(Lr.c, Lr.x, Lr.y); ctx.restore(); }
  function layer(Lr) { const [px, py] = Lr.pivot; ctx.save(); ctx.translate(px, py); ctx.scale(CFG.layerOverscan, CFG.layerOverscan); ctx.translate(-px, -py); ctx.drawImage(Lr.c, Lr.x, Lr.y); ctx.restore(); }
  function drawArm(up, lo, hd, upDeg, loDeg, hdDeg, lift) {
    ctx.save(); ctx.translate(0, lift);
    ctx.translate(up.pivot[0], up.pivot[1]); ctx.rotate(upDeg * Math.PI / 180); ctx.translate(-up.pivot[0], -up.pivot[1]); layer(up);
    ctx.translate(lo.pivot[0], lo.pivot[1]); ctx.rotate(loDeg * Math.PI / 180); ctx.translate(-lo.pivot[0], -lo.pivot[1]); layer(lo);
    ctx.translate(hd.pivot[0], hd.pivot[1]); ctx.rotate(hdDeg * Math.PI / 180); ctx.translate(-hd.pivot[0], -hd.pivot[1]); layer(hd);
    ctx.restore();
  }

  function init() {
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cutRect('head', R.head, 'bottom'); cutRect('jaw', R.jaw); cutRect('eyeL', R.eyeL); cutRect('eyeR', R.eyeR); cutRect('browL', R.browL); cutRect('browR', R.browR); cutRect('chest', R.chest);
    cutPoly('hairL', R.hairL, 10); cutPoly('hairR', R.hairR, 10);
    cutPoly('upL', R.upL, 14); cutPoly('loL', R.loL, 16); cutPoly('hdL', R.hdL, 14); cutPoly('upR', R.upR, 14); cutPoly('loR', R.loR, 16); cutPoly('hdR', R.hdR, 14);
    // corpo base = imagem sem as regiões que viram camadas móveis
    const body = document.createElement('canvas'); body.width = cv.width; body.height = cv.height; const bx = body.getContext('2d');
    bx.drawImage(img, 0, 0); bx.globalCompositeOperation = 'destination-out';
    for (const n of ['upL', 'loL', 'hdL', 'upR', 'loR', 'hdR']) { const Lr = L[n], [px, py] = Lr.pivot; bx.save(); bx.translate(px, py); bx.scale(1.06, 1.06); bx.translate(-px, -py); bx.drawImage(Lr.c, Lr.x, Lr.y); bx.restore(); }
    bx.globalAlpha = .85; bx.drawImage(L.head.c, L.head.x, L.head.y);   // cabeça: remoção parcial (mantém base do pescoço)
    L.body = body;
    requestAnimationFrame(frame);
  }
  if (img.complete && img.naturalWidth) init(); else img.addEventListener('load', init);

  window.CyberwaveRig = {
    bind, gesture: startGesture, emote, lookAt, pose: applyPreset,
    follow: v => (CFG.followCursor = !!v),
    setMouth: v => (S.mouthTarget = clamp(v, 0, 1)),
    setTalking: v => (v ? startTalk() : stopTalk()),
    gestures: Object.keys(G), emotes: Object.keys(EM), presets: Object.keys(PRESETS), config: CFG,
  };
})();
