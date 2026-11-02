/**
 * English+ optional voice-to-voice client. No credentials are embedded in this file.
 * Real sessions require a separately authorized, quota-protected backend which
 * supplies a short-lived client credential and enforces server-side expiry.
 */
export class VoiceSession {
  constructor(endpoint, onState = () => {}, deps = {}) {
    this.endpoint = endpoint;
    this.onState = onState;
    this.deps = deps;
    this.session = null;
  }

  get active() { return this.session !== null; }
  remainingSeconds() {
    const s = this.session;
    if (!s || !s.deadline) return 0;
    return Math.max(0, Math.ceil((s.deadline - this.now()) / 1000));
  }
  now() { return (this.deps.now || Date.now)(); }

  async start({ topic, level = 'A1', seconds = 120 } = {}) {
    if (this.active) throw Error('already_started');
    if (!['intro', 'travel', 'work', 'study'].includes(topic) ||
        !['A1', 'A2', 'B1', 'B2', 'C1'].includes(level) ||
        ![120, 180, 300].includes(seconds)) throw Error('invalid_options');
    let endpoint;
    try { endpoint = new URL(this.endpoint); }
    catch { throw Error('backend_not_configured'); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        endpoint.hash) throw Error('backend_not_configured');

    const fetcher = this.deps.fetch || globalThis.fetch;
    const media = this.deps.mediaDevices || globalThis.navigator?.mediaDevices;
    const PeerConnection = this.deps.RTCPeerConnection || globalThis.RTCPeerConnection;
    const makeAudio = this.deps.makeAudio || (() => new globalThis.Audio());
    const setTimer = this.deps.setTimeout || globalThis.setTimeout;
    if (typeof fetcher !== 'function' || !media?.getUserMedia || !PeerConnection)
      throw Error('browser_audio_unsupported');

    const s = { controller: new AbortController(), stream: null, pc: null,
      channel: null, audio: null, timer: null, deadline: 0, setTimer };
    this.session = s;
    this.onState('connecting');
    const assertActive = () => {
      if (this.session !== s || s.controller.signal.aborted) throw Error('session_stopped');
    };

    try {
      // Request a microphone explicitly on user start, before minting credentials.
      const acquired = await media.getUserMedia({ audio: true });
      // The user might have stopped while the permission dialog was open.
      // In that case, stop the *late* stream immediately rather than leaking it.
      if (this.session !== s || s.controller.signal.aborted) {
        try { acquired.getTracks().forEach(track => track.stop()); } catch {}
        throw Error('session_stopped');
      }
      s.stream = acquired;
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
      s.stream.getTracks().forEach(track => s.pc.addTrack(track, s.stream));
      s.audio = makeAudio();
      s.audio.autoplay = true;
      s.pc.ontrack = e => {
        if (this.session === s && e.streams?.[0]) s.audio.srcObject = e.streams[0];
      };
      s.channel = s.pc.createDataChannel('oai-events');
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

      // Client-side hard stop is a defense-in-depth mechanism, not a server TTL.
      s.deadline = this.now() + seconds * 1000;
      s.timer = setTimer(() => this.stop(), seconds * 1000);
      const doc = this.deps.document || globalThis.document;
      const win = this.deps.window || globalThis.window;
      s.doc = doc;
      s.win = win;
      s.onVisibility = () => { if (doc?.hidden) this.stop(); };
      s.onPageHide = () => this.stop();
      doc?.addEventListener?.('visibilitychange', s.onVisibility);
      win?.addEventListener?.('pagehide', s.onPageHide);
      this.onState('live');
    } catch (error) {
      if (this.session === s) this.stop();
      // Avoid leaking provider request details, tokens or transcripts in errors.
      if (error?.message === 'session_stopped') throw error;
      const approved = new Set(['session_not_authorized', 'invalid_session', 'realtime_connection_failed']);
      throw Error(approved.has(error?.message) ? error.message : 'session_start_failed');
    }
  }

  stop() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.controller.abort();
    (this.deps.clearTimeout || globalThis.clearTimeout)(s.timer);
    s.doc?.removeEventListener?.('visibilitychange', s.onVisibility);
    s.win?.removeEventListener?.('pagehide', s.onPageHide);
    // Each cleanup remains independent so one failure cannot leave the mic on.
    try { s.channel?.close(); } catch {}
    try { s.pc?.close(); } catch {}
    try { s.stream?.getTracks()?.forEach(track => { try { track.stop(); } catch {} }); } catch {}
    try { s.audio?.pause(); if (s.audio) s.audio.srcObject = null; } catch {}
    this.onState('stopped');
  }
}
