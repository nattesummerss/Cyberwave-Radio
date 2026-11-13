/* ===== Cyberwave Radio – ANDRA-18 (voz, legendas, notícias, HUD) =====
 * Requer host.html + host.css. Carregue host-rig.js ANTES deste arquivo.
 */
(function () {
  const root = document.getElementById('cw-host');
  if (!root) return;
  const caption = root.querySelector('#cw-caption');
  const bars = [...root.querySelectorAll('.cw-eq i')];
  const synth = window.speechSynthesis;

  const HOST = { name: 'Andra-18', lang: 'pt-BR', voiceHint: /pt-BR|Portuguese|Luciana|Francisca|Google português/i, rate: 1.02, pitch: 1.05 };
  const INTROS = [
    'Você está sintonizado na Cyberwave Radio. Eu sou a Andra-18, sua host direto de Night City.',
    'Sinal estável, neon ligado. Aqui é a Andra-18 — fique com a gente na Cyberwave Radio.',
    'Boas-vindas à Cyberwave. Música, notícias e sinais do futuro. Eu sou a Andra-18.',
  ];

  let voice = null;
  function pickVoice() {
    const voices = synth ? synth.getVoices() : [];
    voice = voices.find(v => HOST.voiceHint.test(v.name) || HOST.voiceHint.test(v.lang)) || voices[0] || null;
  }
  if (synth) { synth.onvoiceschanged = pickVoice; pickVoice(); }

  let typeTimer = null;
  function typeCaption(text) {
    clearInterval(typeTimer); caption.innerHTML = '';
    let i = 0; const cur = document.createElement('span'); cur.className = 'cursor'; cur.innerHTML = '&nbsp;';
    typeTimer = setInterval(() => { caption.textContent = text.slice(0, ++i); caption.appendChild(cur); if (i >= text.length) clearInterval(typeTimer); }, 28);
  }

  function duckMusic(on) {
    const a = window.cwAudio; if (!a) return;
    if (on) { a.dataset.vol = a.dataset.vol || a.volume; a.volume = Math.max(0.1, a.dataset.vol * 0.3); }
    else if (a.dataset.vol) { a.volume = +a.dataset.vol; delete a.dataset.vol; }
  }

  function speak(text) {
    if (!synth) { typeCaption(text); if (window.CyberwaveRig) { CyberwaveRig.setTalking(true); setTimeout(() => CyberwaveRig.setTalking(false), text.length * 70); } return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = HOST.lang; u.rate = HOST.rate; u.pitch = HOST.pitch; if (voice) u.voice = voice;
    if (window.CyberwaveRig) CyberwaveRig.bind(u, text);          // anima boca/cabeça/corpo em tempo real
    u.onstart = () => { root.classList.add('is-talking'); typeCaption(text); duckMusic(true); };
    u.onend = u.onerror = () => { root.classList.remove('is-talking'); duckMusic(false); };
    synth.speak(u);
  }

  // ---------- Notícias via RSS ----------
  const FEEDS = [
    'https://feeds.bbci.co.uk/portuguese/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://moxie.foxnews.com/google-publisher/latest.xml',
    'https://revistaoeste.com/feed/',
  ];
  async function fetchHeadlines(max = 5) {
    const out = [];
    for (const url of FEEDS) {
      try {
        const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url));
        const j = await r.json(); (j.items || []).slice(0, 2).forEach(it => out.push(it.title));
      } catch (e) {}
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }
  async function readNews() {
    speak('Giro de notícias Cyberwave. Buscando os principais sinais do mundo.');
    const heads = await fetchHeadlines();
    if (!heads.length) { speak('Sem sinal das fontes de notícias no momento. Voltamos à programação musical.'); return; }
    speak('Manchetes de agora: ' + heads.map((h, i) => `${i + 1}. ${h}`).join('. ') + '. Essas foram as notícias. Seguimos com música.');
  }

  // ---------- Equalizer ----------
  function animateEQ() {
    const an = window.cwAnalyser;
    if (an) { const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); bars.forEach((b, i) => b.style.height = (15 + d[i * 4] / 255 * 85) + '%'); }
    else { const talking = root.classList.contains('is-talking'); bars.forEach(b => b.style.height = (talking ? 20 + Math.random() * 80 : 12 + Math.random() * 18) + '%'); }
    requestAnimationFrame(animateEQ);
  }
  animateEQ();

  setInterval(() => { root.classList.add('glitch'); setTimeout(() => root.classList.remove('glitch'), 400); }, 9000 + Math.random() * 6000);

  root.querySelector('#cw-btn-intro').addEventListener('click', () => speak(INTROS[Math.floor(Math.random() * INTROS.length)]));
  root.querySelector('#cw-btn-news').addEventListener('click', readNews);
  root.querySelector('#cw-btn-stop').addEventListener('click', () => { synth && synth.cancel(); root.classList.remove('is-talking'); duckMusic(false); if (window.CyberwaveRig) CyberwaveRig.setTalking(false); });

  setInterval(readNews, 30 * 60 * 1000);   // giro automático a cada 30 min
  window.CyberwaveHost = { speak, readNews };
})();
