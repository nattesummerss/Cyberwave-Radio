/* Cyberwave Radio · spotify-connect.js (v36)
 * Modo PREMIUM: login do OUVINTE via OAuth PKCE (sem segredo no site) + Web Playback SDK.
 * A aba da Cyberwave vira um dispositivo "Spotify Connect" e toca o áudio aqui, com DRM.
 *
 * Requisitos:
 *  - Conta Spotify Premium completa do ouvinte (Lite/Mini não funcionam).
 *  - App criado em developer.spotify.com → Client ID + Redirect URI = URL desta página.
 *  - Widevine disponível no navegador (ver testar-spotify.html).
 *  - Projeto NÃO comercial (termo do SDK).
 *
 * Uso mínimo:
 *   CyberwaveSpotify.connect.config({ clientId: 'SEU_CLIENT_ID', redirectUri: location.origin + location.pathname });
 *   await CyberwaveSpotify.connect.handleRedirect();      // chame no load da página
 *   btn.onclick = () => CyberwaveSpotify.connect.login();
 *   await CyberwaveSpotify.connect.ready();                // cria o player
 *   await CyberwaveSpotify.connect.play('spotify:chapter:ID'); // ou lista de URIs
 */
(function (global) {
  'use strict';

  const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'];
  const LS = 'cw_spotify_auth';
  const cfg = { clientId: '', redirectUri: '', deviceName: 'Cyberwave Radio' };
  const st = { player: null, deviceId: null, ready: false, onState: () => {}, onError: () => {} };

  // ---------- PKCE ----------
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function randomString(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, x => ('0' + (x % 36).toString(36)).slice(-1)).join(''); }
  async function challenge(verifier) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }

  function config(o) { Object.assign(cfg, o || {}); return cfg; }
  function saved() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function save(t) { localStorage.setItem(LS, JSON.stringify(Object.assign({ at: Date.now() }, t))); }
  function logout() { localStorage.removeItem(LS); if (st.player) { try { st.player.disconnect(); } catch (e) {} } st.player = null; st.ready = false; st.deviceId = null; }
  function isLogged() { const s = saved(); return !!(s && s.refresh_token); }

  async function login() {
    if (!cfg.clientId || !cfg.redirectUri) throw new Error('spotify-connect: configure clientId e redirectUri');
    const verifier = randomString(64);
    sessionStorage.setItem('cw_pkce_verifier', verifier);
    const p = new URLSearchParams({
      response_type: 'code', client_id: cfg.clientId, scope: SCOPES.join(' '),
      code_challenge_method: 'S256', code_challenge: await challenge(verifier), redirect_uri: cfg.redirectUri
    });
    location.href = 'https://accounts.spotify.com/authorize?' + p.toString();
  }

  async function tokenRequest(body) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body)
    });
    if (!r.ok) throw new Error('token ' + r.status + ' ' + (await r.text()));
    return r.json();
  }

  async function handleRedirect() {
    const u = new URL(location.href);
    const code = u.searchParams.get('code');
    if (!code) return false;
    const verifier = sessionStorage.getItem('cw_pkce_verifier');
    if (!verifier) return false;
    const t = await tokenRequest({ client_id: cfg.clientId, grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, code_verifier: verifier });
    save(t);
    sessionStorage.removeItem('cw_pkce_verifier');
    u.searchParams.delete('code'); u.searchParams.delete('state');
    history.replaceState({}, '', u.toString());
    return true;
  }

  async function accessToken() {
    const s = saved();
    if (!s) throw new Error('não logado');
    const expired = Date.now() - s.at > (s.expires_in - 60) * 1000;
    if (!expired) return s.access_token;
    const t = await tokenRequest({ client_id: cfg.clientId, grant_type: 'refresh_token', refresh_token: s.refresh_token });
    save(Object.assign({ refresh_token: s.refresh_token }, t));
    return t.access_token;
  }

  async function api(path, opts) {
    const tok = await accessToken();
    const r = await fetch('https://api.spotify.com/v1' + path, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, (opts && opts.headers) || {})
    }));
    if (r.status === 204) return null;
    if (!r.ok) throw new Error('api ' + r.status + ' ' + (await r.text()));
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  }

  async function me() { return api('/me'); }

  // ---------- Web Playback SDK ----------
  function loadSdk() {
    return new Promise((ok, bad) => {
      if (global.Spotify && global.Spotify.Player) return ok();
      global.onSpotifyWebPlaybackSDKReady = () => ok();
      const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
      s.onerror = () => bad(new Error('SDK bloqueado nesta rede'));
      document.head.appendChild(s);
      setTimeout(() => (global.Spotify ? ok() : bad(new Error('SDK não inicializou'))), 15000);
    });
  }

  async function ready(opts) {
    opts = opts || {};
    st.onState = opts.onState || st.onState; st.onError = opts.onError || st.onError;
    if (st.ready) return st.deviceId;
    if (!isLogged()) throw new Error('faça login primeiro');
    await loadSdk();
    return new Promise((ok, bad) => {
      const p = new global.Spotify.Player({
        name: cfg.deviceName, volume: opts.volume != null ? opts.volume : 0.8,
        getOAuthToken: cb => accessToken().then(cb).catch(e => st.onError({ type: 'auth', message: e.message }))
      });
      p.addListener('ready', ({ device_id }) => { st.deviceId = device_id; st.ready = true; ok(device_id); });
      p.addListener('not_ready', () => { st.ready = false; });
      p.addListener('player_state_changed', s => { if (s) st.onState(s); });
      ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(ev =>
        p.addListener(ev, e => { st.onError({ type: ev, message: e.message }); if (ev === 'account_error') bad(new Error('Conta sem Premium completo')); })
      );
      p.connect().then(okc => { if (!okc) bad(new Error('player não conectou')); });
      st.player = p;
      setTimeout(() => { if (!st.ready) bad(new Error('player não ficou pronto (Widevine/rede?)')); }, 20000);
    });
  }

  async function play(uris, positionMs) {
    if (!st.ready) await ready();
    const list = (Array.isArray(uris) ? uris : [uris]).filter(Boolean);
    const body = {};
    // Para audiobooks: tocar o capítulo; para show/album/playlist usar context_uri.
    if (list.length === 1 && /^spotify:(show|album|playlist|audiobook):/.test(list[0])) body.context_uri = list[0];
    else body.uris = list;
    if (positionMs) body.position_ms = positionMs;
    await api('/me/player/play?device_id=' + encodeURIComponent(st.deviceId), { method: 'PUT', body: JSON.stringify(body) });
  }
  const pause = () => st.player && st.player.pause();
  const resume = () => st.player && st.player.resume();
  const toggle = () => st.player && st.player.togglePlay();
  const nextTrack = () => st.player && st.player.nextTrack();
  const prevTrack = () => st.player && st.player.previousTrack();
  const seek = ms => st.player && st.player.seek(ms);
  const volume = v => st.player && st.player.setVolume(v);
  const getState = () => st.player ? st.player.getCurrentState() : Promise.resolve(null);

  global.CyberwaveSpotify = global.CyberwaveSpotify || {};
  global.CyberwaveSpotify.connect = { config, login, logout, isLogged, handleRedirect, me, api, ready, play, pause, resume, toggle, nextTrack, prevTrack, seek, volume, getState, get deviceId() { return st.deviceId; } };
})(window);
