/**
 * English+ optional WebRTC voice client. Fail closed on interrupted media.
 * NO production backend, secrets, persistence, retry loop, or paid integration here.
 * A separately protected server MUST enforce authorization, quota, budget and
 * a hard session termination; browser timers are only defense in depth.
 */
const TOPICS = new Set(['intro', 'travel', 'work', 'study']);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const DURATIONS = new Set([120, 180, 300]);
const INTERRUPTION_GRACE_MS = 3000;
const CONNECT_TIMEOUT_MS = 20000;

export class VoiceSession {
  constructor(endpoint, onState = () => {}, deps = {}) {
    this.endpoint = endpoint;
    this.onState = onState;
    this.deps = deps;
    this.session = null;
    this.lastStopReason = null;
  }

  get active() { return this.session !== null; }
  remainingSeconds() {
    const s = this.session;
    if (!s || !s.deadline) return 0;
    const seconds = Math.max(0, Math.ceil((s.deadline - this.now()) / 1000));
    if (!seconds) this.stop('expired');
    return seconds;
  }
  now() { return (this.deps.now || Date.now)(); }
  emit(state, reason = null) {
    // UI callbacks are untrusted; a thrown UI exception must never keep the mic on.
    try { this.onState(state, reason); } catch {}
  }

  async start({ topic, level = 'A1', seconds = 120 } = {}) {
    if (this.active) throw Error('already_started');
    if (!TOPICS.has(topic) || !LEVELS.has(level) || !DURATIONS.has(seconds))
      throw Error('invalid_options');
    let endpoint;
    try { endpoint = new URL(this.endpoint); }
    catch { throw Error('backend_not_configured'); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)
      throw Error('backend_not_configured');

    const fetcher = this.deps.fetch || globalThis.fetch;
    const media = this.deps.mediaDevices || globalThis.navigator?.mediaDevices;
    const PeerConnection = this.deps.RTCPeerConnection || globalThis.RTCPeerConnection;
    const makeAudio = this.deps.makeAudio || (() => new globalThis.Audio());
    const setTimer = this.deps.setTimeout || globalThis.setTimeout;
    const clearTimer = this.deps.clearTimeout || globalThis.clearTimeout;
    if (typeof fetcher !== 'function' || !media?.getUserMedia || !PeerConnection)
      throw Error('browser_audio_unsupported');

    const s = {
      controller: new AbortController(), stream: null, pc: null, channel: null,
      audio: null, deadline: 0, timer: null, startupTimer: null,
      interruptionTimers: new Map(), removers: [], setTimer, clearTimer
    };
    this.session = s;
    this.lastStopReason = null;
    this.emit('connecting');
    const active = () => this.session === s && !s.controller.signal.aborted;
    const assertActive = () => { if (!active()) throw Error('session_stopped'); };

    const listen = (target, event, handler) => {
      if (!target) return;
      if (typeof target.addEventListener === 'function') {
        target.addEventListener(event, handler);
        s.removers.push(() => target.removeEventListener?.(event, handler));
      } else {
        const prop = 'on' + event, previous = target[prop];
        target[prop] = handler;
        s.removers.push(() => { if (target[prop] === handler) target[prop] = previous; });
      }
    };
    const clearInterruption = key => {
      if (!s.interruptionTimers.has(key)) return;
      s.clearTimer(s.interruptionTimers.get(key));
      s.interruptionTimers.delete(key);
    };
    const interruption = (key, reason) => {
      if (!active() || s.interruptionTimers.has(key)) return;
      s.interruptionTimers.set(key, s.setTimer(() => {
        s.interruptionTimers.delete(key);
        if (active()) this.stop(reason);
      }, INTERRUPTION_GRACE_MS));
    };

    try {
      // Attach page/network interruption listeners BEFORE opening the mic.
      const doc = this.deps.document || globalThis.document;
      const win = this.deps.window || globalThis.window;
      const nav = this.deps.navigator || globalThis.navigator;
      listen(doc, 'visibilitychange', () => { if (doc.hidden) this.stop('hidden'); });
      listen(win, 'pagehide', () => this.stop('pagehide'));
      listen(win, 'offline', () => this.stop('interrupted_offline'));
      if (doc?.hidden || nav?.onLine === false) {
        this.stop(doc?.hidden ? 'hidden' : 'interrupted_offline');
        assertActive();
      }
      // No silent retries; after timeout user must explicitly start again.
      s.startupTimer = setTimer(() => this.stop('setup_timeout'), CONNECT_TIMEOUT_MS);
      const acquired = await media.getUserMedia({ audio: true });
      // Stop tracks returned AFTER a stopped/aborted permission dialog.
      if (!active()) {
        try { acquired.getTracks().forEach(track => track.stop()); } catch {}
        throw Error('session_stopped');
      }
      s.stream = acquired;
      const tracks = s.stream.getTracks();
      if (!tracks?.length || tracks.some(track => track.readyState === 'ended'))
        throw Error('invalid_audio_stream');
      tracks.forEach(track => {
        listen(track, 'ended', () => this.stop('interrupted_mic_ended'));
        listen(track, 'mute', () => interruption('mic', 'interrupted_mic_muted'));
        listen(track, 'unmute', () => clearInterruption('mic'));
      });
      assertActive();
      const response = await fetcher(endpoint.href, {
        method: 'POST', credentials: 'include', signal: s.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, level, seconds })
      });
      assertActive();
      if (!response.ok) throw Error('session_not_authorized');
      const data = await response.json();
      assertActive();
      const ephemeral = data?.client_secret?.value;
      if (typeof ephemeral !== 'string' || ephemeral.length < 8) throw Error('invalid_session');

      s.pc = new PeerConnection();
      listen(s.pc, 'connectionstatechange', () => {
        if (!active()) return;
        const state = s.pc.connectionState;
        if (state === 'failed' || state === 'closed') this.stop('interrupted_peer_failed');
        else if (state === 'disconnected') interruption('peer', 'interrupted_peer_disconnected');
        else if (state === 'connected') clearInterruption('peer');
      });
      listen(s.pc, 'iceconnectionstatechange', () => {
        if (!active()) return;
        const state = s.pc.iceConnectionState;
        if (state === 'failed' || state === 'closed') this.stop('interrupted_ice_failed');
        else if (state === 'disconnected') interruption('ice', 'interrupted_ice_disconnected');
        else if (state === 'connected' || state === 'completed') clearInterruption('ice');
      });
      tracks.forEach(track => s.pc.addTrack(track, s.stream));
      s.audio = makeAudio();
      s.audio.autoplay = true;
      listen(s.audio, 'error', () => { if (active()) this.stop('interrupted_audio_error'); });
      listen(s.pc, 'track', e => {
        if (!active() || !e.streams?.[0]) return;
        s.audio.srcObject = e.streams[0];
        for (const track of (e.streams[0].getTracks?.() || [])) {
          listen(track, 'ended', () => this.stop('interrupted_remote_ended'));
          listen(track, 'mute', () => interruption('remote', 'interrupted_remote_muted'));
          listen(track, 'unmute', () => clearInterruption('remote'));
        }
      });
      s.channel = s.pc.createDataChannel('oai-events');
      listen(s.channel, 'close', () => { if (active()) this.stop('interrupted_channel_closed'); });
      listen(s.channel, 'error', () => { if (active()) this.stop('interrupted_channel_error'); });
      const offer = await s.pc.createOffer();
      assertActive();
      await s.pc.setLocalDescription(offer);
      assertActive();
      const answer = await fetcher('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', signal: s.controller.signal,
        headers: { Authorization: 'Bearer ' + ephemeral, 'Content-Type': 'application/sdp' },
        body: offer.sdp
      });
      assertActive();
      if (!answer.ok) throw Error('realtime_connection_failed');
      const sdp = await answer.text();
      assertActive();
      await s.pc.setRemoteDescription({ type: 'answer', sdp });
      assertActive();

      s.clearTimer(s.startupTimer);
      s.startupTimer = null;
      s.deadline = this.now() + seconds * 1000;
      s.timer = s.setTimer(() => this.stop('expired'), seconds * 1000);
      this.emit('live');
    } catch (error) {
      if (active()) this.stop('failed');
      if (error?.message === 'session_stopped') throw error;
      const approved = new Set(['session_not_authorized', 'invalid_session', 'realtime_connection_failed']);
      throw Error(approved.has(error?.message) ? error.message : 'session_start_failed');
    }
  }

  stop(reason = 'manual') {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.lastStopReason = reason;
    try { s.controller.abort(); } catch {}
    try { s.clearTimer(s.timer); s.clearTimer(s.startupTimer); } catch {}
    for (const timer of s.interruptionTimers.values()) {
      try { s.clearTimer(timer); } catch {}
    }
    s.interruptionTimers.clear();
    for (const remove of s.removers.splice(0)) { try { remove(); } catch {} }
    try { s.channel?.close(); } catch {}
    try { s.pc?.close(); } catch {}
    try { s.stream?.getTracks()?.forEach(track => { try { track.stop(); } catch {} }); } catch {}
    try { s.audio?.pause(); if (s.audio) s.audio.srcObject = null; } catch {}
    this.emit('stopped', reason);
  }
}
