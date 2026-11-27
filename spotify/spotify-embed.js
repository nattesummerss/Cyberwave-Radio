/* Cyberwave Radio · spotify-embed.js (v36)
 * Modo GRATUITO: usa o player oficial do Spotify (iFrame API) dentro da página.
 * - Sem login: toca preview de 30 s (audiolivros) ou episódio completo (podcasts/audiosséries).
 * - Com login no próprio embed: toca completo o que a conta do ouvinte tiver direito.
 * - Fila de capítulos: ao terminar um, carrega o próximo.
 * - Fallback: se o iframe não carregar (rede bloqueada), mostra link "Abrir no Spotify".
 *
 * Uso mínimo:
 *   CyberwaveSpotify.embed.init('#spotify-player');
 *   CyberwaveSpotify.embed.loadQueue(['spotify:episode:ID1','spotify:episode:ID2'], {title:'Audiossérie X'});
 */
(function (global) {
  'use strict';

  const IFRAME_API = 'https://open.spotify.com/embed/iframe-api/v1';
  const state = {
    ctrl: null, api: null, el: null, host: null,
    queue: [], idx: -1, meta: {}, ready: false, failed: false,
    onChange: () => {}, lastPos: 0, lastDur: 0, ended: false
  };

  // ---------- util ----------
  function parseUri(input) {
    // aceita spotify:TYPE:ID ou https://open.spotify.com/TYPE/ID?...
    if (!input) return null;
    let m = /^spotify:(track|episode|show|album|playlist|audiobook|chapter):([A-Za-z0-9]+)$/.exec(input);
    if (m) return { type: m[1], id: m[2], uri: input };
    m = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|episode|show|album|playlist|audiobook|chapter)\/([A-Za-z0-9]+)/.exec(input);
    if (m) return { type: m[1], id: m[2], uri: `spotify:${m[1]}:${m[2]}` };
    return null;
  }
  function webUrl(uri) { const p = parseUri(uri); return p ? `https://open.spotify.com/${p.type}/${p.id}` : 'https://open.spotify.com/'; }
  function loadScript(src, ms) {
    return new Promise((ok, bad) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const s = document.createElement('script'); s.src = src; s.async = true;
      const to = setTimeout(() => bad(new Error('timeout')), ms || 12000);
      s.onload = () => { clearTimeout(to); ok(); };
      s.onerror = () => { clearTimeout(to); bad(new Error('bloqueado')); };
      document.head.appendChild(s);
    });
  }
  function emit(evt, data) { try { state.onChange(evt, Object.assign({ index: state.idx, total: state.queue.length }, data || {})); } catch (e) {} }

  // ---------- fallback ----------
  function renderFallback(uri, msg) {
    state.failed = true;
    const url = webUrl(uri || state.queue[Math.max(state.idx, 0)]);
    state.host.innerHTML = `
      <div class="cw-sp-fallback" style="background:#131a2b;border-radius:12px;padding:16px;color:#e8ecf5;font-family:system-ui,sans-serif">
        <div style="font-weight:700;margin-bottom:6px">Spotify indisponível nesta rede</div>
        <div style="color:#8b94a8;font-size:.9rem;margin-bottom:12px">${msg || 'O player não carregou. Você pode continuar no app ou site do Spotify.'}</div>
        <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;background:#1db954;color:#000;font-weight:700;padding:10px 16px;border-radius:10px;text-decoration:none">Abrir no Spotify ↗</a>
      </div>`;
    emit('fallback', { url });
  }

  // ---------- core ----------
  async function init(selector, opts) {
    opts = opts || {};
    state.host = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!state.host) throw new Error('spotify-embed: container não encontrado');
    state.onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    state.height = opts.height || 352;

    try { await loadScript(IFRAME_API); }
    catch (e) { renderFallback(null, 'A rede bloqueou open.spotify.com. Use o atalho abaixo.'); return false; }

    await new Promise(res => {
      if (global.SpotifyIframeApi) return res();
      const prev = global.onSpotifyIframeApiReady;
      global.onSpotifyIframeApiReady = api => { global.SpotifyIframeApi = api; if (prev) try { prev(api); } catch (e) {} res(); };
      setTimeout(res, 15000); // não travar para sempre
    });
    if (!global.SpotifyIframeApi) { renderFallback(null, 'A API do player não respondeu.'); return false; }
    state.api = global.SpotifyIframeApi;
    return true;
  }

  function mount(uri) {
    state.host.innerHTML = '';
    state.el = document.createElement('div');
    state.host.appendChild(state.el);
    state.ready = false; state.ended = false; state.lastPos = 0; state.lastDur = 0;

    const to = setTimeout(() => { if (!state.ready) renderFallback(uri, 'O player demorou demais para carregar.'); }, 20000);

    state.api.createController(state.el, { uri, width: '100%', height: state.height }, ctrl => {
      state.ctrl = ctrl;
      ctrl.addListener('ready', () => { clearTimeout(to); state.ready = true; emit('ready', { uri }); });
      ctrl.addListener('playback_update', e => {
        const d = e && e.data ? e.data : {};
        state.lastPos = d.position || 0; state.lastDur = d.duration || 0;
        emit('progress', { position: state.lastPos, duration: state.lastDur, paused: !!d.isPaused });
        // Detecta fim do capítulo: pausado e posição ≥ 98% da duração (ou duração 0 e position zerou após tocar)
        if (d.isPaused && state.lastDur > 0 && state.lastPos >= state.lastDur * 0.98 && !state.ended) {
          state.ended = true; emit('ended', { uri });
          setTimeout(next, 600);
        }
      });
    });
  }

  function loadQueue(items, meta) {
    const uris = (Array.isArray(items) ? items : [items]).map(parseUri).filter(Boolean).map(p => p.uri);
    if (!uris.length) throw new Error('spotify-embed: nenhum URI válido');
    state.queue = uris; state.meta = meta || {}; state.idx = 0; state.failed = false;
    emit('queue', { uris, meta: state.meta });
    if (!state.api) { renderFallback(uris[0]); return; }
    mount(uris[0]);
  }

  function goTo(i, autoplay) {
    if (i < 0 || i >= state.queue.length) return false;
    state.idx = i;
    const uri = state.queue[i];
    if (state.ctrl && state.ready && !state.failed) {
      state.ended = false;
      try { state.ctrl.loadUri(uri); if (autoplay) state.ctrl.play(); } catch (e) { mount(uri); }
    } else { mount(uri); }
    emit('change', { uri });
    return true;
  }
  function next() { return goTo(state.idx + 1, true); }
  function prev() { return goTo(state.idx - 1, true); }
  function play() { if (state.ctrl) state.ctrl.play(); }
  function pause() { if (state.ctrl) state.ctrl.pause(); }
  function toggle() { if (state.ctrl) state.ctrl.togglePlay(); }
  function seek(sec) { if (state.ctrl) state.ctrl.seek(sec); }
  function current() { return { index: state.idx, uri: state.queue[state.idx], url: webUrl(state.queue[state.idx]), meta: state.meta, ready: state.ready, failed: state.failed }; }
  function destroy() { try { state.ctrl && state.ctrl.destroy(); } catch (e) {} state.ctrl = null; state.ready = false; if (state.host) state.host.innerHTML = ''; }

  global.CyberwaveSpotify = global.CyberwaveSpotify || {};
  global.CyberwaveSpotify.embed = { init, loadQueue, goTo, next, prev, play, pause, toggle, seek, current, destroy, parseUri, webUrl };
})(window);
