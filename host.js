/* ===== Cyberwave Radio – ANDRA-18 (voz, legendas, notícias, HUD). Carregue host-rig.js ANTES. =====
 * Versão integrada ao site: a voz, as notícias e o volume da rádio são do próprio site
 * (window.CyberwaveHost, criado pelo painel CW NEWS):
 *  - voz neural feminina gravada pelo GitHub (pasta voz/), ou a voz feminina do navegador;
 *  - idioma de cada trecho identificado na hora: nomes e títulos em inglês/espanhol/etc. na voz daquele idioma;
 *  - manchetes do arquivo noticias.json (CNN Brasil, BBC News Brasil, Fox News, Revista Oeste, Ancapsu);
 *  - a rádio abaixa sozinha enquanto ela fala.
 * O site avisa este arquivo com eventos:
 *   cw:speak {text, tag, mood, news}  → legenda, gestos e expressão de acordo com a fala
 *   cw:speakend                       → volta a relaxar
 *   cw:stationchange {name} · cw:trackchange {title, artist}
 * Se o painel do site não estiver aberto, ela usa a voz do navegador como no arquivo original.
 */
(function () {
  const root = document.getElementById('cw-host'); if (!root) return;
  const caption = root.querySelector('#cw-caption'); const bars = [...root.querySelectorAll('.cw-eq i')]; const synth = window.speechSynthesis;
  const rig = () => window.CyberwaveRig;
  const site = () => { const h = window.CyberwaveHost; return h && h.fromSite ? h : null; };
  // Movimento natural: cabeça e corpo deslocam pouco (evita a "cabeça dupla" das camadas recortadas).
  // Para mais amplitude: CyberwaveRig.config.amp = 1.3 (ou ajuste os valores abaixo).
  if (rig()) Object.assign(rig().config, { headShiftX: 10, headShiftY: 7, headRotDeg: 3.5, bodyShiftX: 9, weightShiftX: 7 });
  const HOST = { name: 'Andra-18', lang: 'pt-BR', rate: 1.02, pitch: 1.05 };
  const INTROS = [
    'Você está sintonizado na Cyberwave Radio. Eu sou a Andra-18, sua host direto de Night City.',
    'Sinal estável, neon ligado. Aqui é a Andra-18 — fique com a gente na Cyberwave Radio.',
    'Boas-vindas à Cyberwave. Música, notícias e sinais do futuro. Eu sou a Andra-18.',
  ];

  // ---------- Voz do navegador (só quando o painel do site não está aberto) ----------
  const FEMALE = /francisca|thalita|luciana|maria|fernanda|vit[oó]ria|camila|let[ií]cia|yara|raquel|helena|brenda|elza|giovanna|leila|manuela|female|feminin|google portugu[eê]s do brasil/i;
  const MALE = /daniel|ant[oô]nio|felipe|f[aá]bio|j[uú]lio|donato|humberto|nicolau|val[eé]rio|duarte|cristiano|ricardo|\bmale\b|masculin/i;
  let voice = null;
  function pickVoice() {
    const v = synth ? synth.getVoices().filter(x => /^pt/i.test(x.lang)) : [];
    voice = v.find(x => FEMALE.test(x.name) && /natural|neural|online/i.test(x.name)) || v.find(x => FEMALE.test(x.name)) || v.find(x => !MALE.test(x.name) && /pt-BR/i.test(x.lang)) || null;
  }
  if (synth) { synth.addEventListener('voiceschanged', pickVoice); pickVoice(); }

  let typeTimer = null;
  function typeCaption(text) {
    clearInterval(typeTimer); caption.textContent = ''; let i = 0; const cur = document.createElement('span'); cur.className = 'cursor'; cur.innerHTML = '&nbsp;';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { caption.textContent = text; return; }
    typeTimer = setInterval(() => { caption.textContent = text.slice(0, ++i); caption.appendChild(cur); if (i >= text.length) clearInterval(typeTimer); }, 28);
  }
  function duckMusic(on) { const a = window.cwAudio; if (!a) return; if (on) { a.dataset.vol = a.dataset.vol || a.volume; a.volume = Math.max(.1, a.dataset.vol * .3); } else if (a.dataset.vol) { a.volume = +a.dataset.vol; delete a.dataset.vol; } }
  // Vocabulário de pronúncia (bloco andra-lexico do index.html): "Cyberwave" → "Sáiber-uêiv" etc.
  let lexico = null;
  function forSpeech(text) {
    if (!lexico) {
      lexico = [];
      try { const el = document.getElementById('andra-lexico'); if (el) lexico = JSON.parse(el.textContent).map(([p, say]) => [new RegExp(p, 'gi'), say]); } catch (e) { lexico = []; }
    }
    return lexico.reduce((t, [re, say]) => t.replace(re, say), text);
  }
  // Idioma de cada trecho, identificado na hora pelo site (window.CyberwaveIdioma, src/lib/andra-lang.ts):
  // "Agora na Cyberwave:" vai para a voz em português e "Linkin Park, Numb" para uma voz feminina em inglês.
  // Sem voz feminina naquele idioma, o trecho é lido pela voz em português com o vocabulário de pronúncia.
  function planOf(text) {
    const I = window.CyberwaveIdioma;
    try { const p = I && I.plan(text); if (p && p.length) return p; } catch (e) { /* segue sem dividir */ }
    return [{ lang: 'pt', text, say: forSpeech(text) }];
  }
  function speakLocal(text) {
    if (!synth || !voice) { typeCaption(text); if (rig()) { rig().setTalking(true); setTimeout(() => rig().setTalking(false), text.length * 70); } return; }
    const shown = text; const plan = planOf(text); const I = window.CyberwaveIdioma;
    synth.cancel();
    plan.forEach((run, i) => {
      const own = run.lang === 'pt' ? voice : (I && I.voice ? I.voice(run.lang) : null);
      const v = own || voice; const say = own ? run.say : forSpeech(run.text);
      const u = new SpeechSynthesisUtterance(say);
      u.lang = v.lang || HOST.lang; u.rate = HOST.rate; u.pitch = HOST.pitch; u.voice = v;
      if (rig()) rig().bind(u, say, { cont: i > 0, last: i === plan.length - 1 });
      if (i === 0) u.onstart = () => { root.classList.add('is-talking'); typeCaption(shown); duckMusic(true); };
      if (i === plan.length - 1) u.onend = () => { root.classList.remove('is-talking'); duckMusic(false); };
      u.onerror = () => { root.classList.remove('is-talking'); duckMusic(false); };
      synth.speak(u);
    });
  }
  function speak(text) { const s = site(); if (s) s.speak(text); else speakLocal(text); }

  // ---------- Notícias ----------
  async function readNews() {
    const s = site();
    if (s) { s.readNews(); return; }   // gestos e legendas chegam pelo evento cw:speak
    if (rig()) rig().gesture('headsetTouch');
    let items = [];
    try { const r = await fetch('noticias.json', { cache: 'no-cache' }); const j = await r.json(); items = (j.items || []).slice(0, 5); } catch (e) {}
    if (!items.length) { if (rig()) rig().gesture('shrug'); speakLocal('Sem sinal das fontes de notícias no momento. Voltamos à programação musical.'); return; }
    speakLocal('Manchetes de agora: ' + items.map((it, i) => `${i + 1}. ${it.sourceName ? it.sourceName + ': ' : ''}${it.title}`).join('. ') + '. Essas foram as notícias. Seguimos com música.');
  }

  // ---------- Reação ao que ela fala (eventos do site) ----------
  const EMOTE_OF = { happy: 'happy', excited: 'happy', serious: 'thinking', alert: 'surprised', neutral: 'neutral' };
  let lastNewsGesture = 0;
  document.addEventListener('cw:speak', e => {
    const d = e.detail || {}; const r = rig();
    typeCaption(d.text || ''); root.classList.add('is-talking');
    root.dataset.mood = d.mood || 'neutral';
    if (!r) return;
    if (d.first && /PLANT/i.test(d.tag || '')) { r.gesture('lean'); r.emote('surprised', 1400); return; }
    if (d.news) {
      // abre cada manchete olhando/apontando para o jornal e toca o headset na primeira
      const now = Date.now();
      r.gesture(now - lastNewsGesture > 20000 ? 'headsetTouch' : (Math.random() < .5 ? 'pointRight' : 'present'));
      lastNewsGesture = now;
    } else if (d.first && /APRESENTA/i.test(d.tag || '')) r.gesture('wave');
    else if (d.first && /SINTONIA/i.test(d.tag || '')) r.gesture('present');
    else if (d.first && /RESPOSTA/i.test(d.tag || '')) r.gesture('openArms');
    if (d.mood && EMOTE_OF[d.mood]) r.emote(EMOTE_OF[d.mood], 4000);
    if (d.mood === 'serious') r.pose('calm'); else if (d.mood === 'excited') r.pose('energetic');
  });
  document.addEventListener('cw:speakend', () => {
    root.classList.remove('is-talking'); delete root.dataset.mood;
    const r = rig(); if (r) { r.setTalking(false); r.config.amp = 1; r.config.gestureEveryMs = [2600, 6500]; }
  });
  document.addEventListener('cw:listen', () => { const r = rig(); if (r) { r.emote('thinking', 3000); r.gesture('lean'); } });

  // ---------- Equalizer ----------
  function animateEQ() {
    if (root.offsetParent !== null) {
      const an = window.cwAnalyser;
      if (an) { const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); bars.forEach((b, i) => b.style.height = (15 + d[i * 4] / 255 * 85) + '%'); }
      else { const t = root.classList.contains('is-talking'); bars.forEach(b => b.style.height = (t ? 20 + Math.random() * 80 : 12 + Math.random() * 18) + '%'); }
    }
    requestAnimationFrame(animateEQ);
  }
  animateEQ();
  setInterval(() => { if (root.offsetParent === null) return; root.classList.add('glitch'); setTimeout(() => root.classList.remove('glitch'), 400); }, 9000 + Math.random() * 6000);

  // ---------- Botões ----------
  root.querySelector('#cw-btn-intro').addEventListener('click', () => { const s = site(); if (s) s.present(); else { if (rig()) rig().gesture('wave'); speakLocal(INTROS[Math.floor(Math.random() * INTROS.length)]); } });
  root.querySelector('#cw-btn-news').addEventListener('click', readNews);
  root.querySelector('#cw-btn-stop').addEventListener('click', () => { const s = site(); if (s) s.stop(); synth && synth.cancel(); root.classList.remove('is-talking'); duckMusic(false); if (rig()) rig().setTalking(false); });
  // Os botões do cartão não disparam também o aceno de "toque na apresentadora".
  root.querySelector('.cw-controls').addEventListener('pointerdown', e => e.stopPropagation());

  // Giro automático: com o site aberto, quem faz é o painel (opção "Voz automática").
  setInterval(() => { if (!site()) readNews(); }, 30 * 60 * 1000);

  // ---------- Integrações com o player ----------
  document.addEventListener('cw:trackchange', e => {
    const d = e.detail || {}; const t = d.title; if (!t) return;
    if (rig()) rig().gesture('pointLeft');
    const s = site();
    if (s ? s.autoVoice() && !s.busy() : false) s.speak('Agora na Cyberwave: ' + (d.artist ? d.artist + ', ' : '') + t);
  });
  document.addEventListener('cw:stationchange', e => { const n = e.detail && e.detail.name; if (n && rig()) { rig().gesture('present'); rig().emote('happy'); } });

  if (!site()) window.CyberwaveHost = { speak, readNews };
})();
