import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession } from '../src/realtime-voice.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { for (const callback of [...(this.listeners.get(name) || [])]) callback(event); }
  count() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
class Track extends Target {
  constructor() { super(); this.readyState = 'live'; this.muted = false; this.stops = 0; }
  stop() { this.stops++; this.readyState = 'ended'; }
  end() { this.readyState = 'ended'; this.emit('ended'); }
  mute() { this.muted = true; this.emit('mute'); }
  unmute() { this.muted = false; this.emit('unmute'); }
}
class Channel extends Target {
  constructor() { super(); this.closes = 0; }
  close() { this.closes++; this.emit('close'); }
}
class Peer extends Target {
  constructor() { super(); this.connectionState = 'new'; this.iceConnectionState = 'new'; this.closes = 0; this.channel = new Channel(); }
  addTrack() {}
  createDataChannel() { return this.channel; }
  async createOffer() { return { sdp: 'FAKE SDP', type: 'offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() { this.closes++; this.connectionState = 'closed'; this.emit('connectionstatechange'); }
  state(value) { this.connectionState = value; this.emit('connectionstatechange'); }
  ice(value) { this.iceConnectionState = value; this.emit('iceconnectionstatechange'); }
}
class AudioOut extends Target {
  constructor() { super(); this.srcObject = null; this.pauses = 0; }
  pause() { this.pauses++; }
}
const stream = track => ({ getTracks: () => [track] });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function rig(opts = {}) {
  let clock = 100, next = 0, pc = null;
  const timers = new Map(), states = [], calls = [];
  let mic = new Track(); const remote = new Track(), win = new Target(), doc = new Target();
  const nav = { onLine: opts.offlineInitially ? false : true };
  doc.hidden = !!opts.hiddenInitially;
  const audio = new AudioOut();
  const deps = {
    now: () => clock,
    setTimeout(fn, ms) { const id = ++next; timers.set(id, {fn, at: clock + ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: doc, window: win, navigator: nav,
    mediaDevices: { getUserMedia: async () => {
      calls.push('mic');
      if (mic.readyState === 'ended') mic = new Track();
      if (opts.micWait) return opts.micWait.promise;
      return stream(mic);
    } },
    RTCPeerConnection: class extends Peer { constructor() { super(); pc = this; } },
    makeAudio: () => audio,
    fetch: async (url, config) => {
      calls.push(url.includes('openai.com') ? 'provider' : 'backend');
      if (url.includes('openai.com')) {
        if (opts.providerWait) return opts.providerWait.promise;
        return {ok:true,text:async()=> 'FAKE SDP ANSWER'};
      }
      if (opts.backendWait) return opts.backendWait.promise;
      return {ok:true,json:async()=>({client_secret:{value:'nonsecret_fake_token'}})};
    }
  };
  const voice = new VoiceSession('https://staging.example/api/speaking/session', (state, reason) => {
    states.push([state,reason]);
    if (opts.throwUi) throw Error('UI exception');
  }, deps);
  const advance = ms => {
    const end = clock + ms;
    for (let safety = 0; safety < 500; safety++) {
      const due = [...timers.entries()].filter(([_,item])=>item.at <= end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!due) break;
      const [key,item] = due;
      timers.delete(key); clock = item.at; item.fn();
      if (safety === 499) throw Error('infinite fake timers');
    }
    clock = end;
  };
  const start = options => voice.start({topic:'intro',seconds:300,...options});
  const remoteTrack = () => {
    pc.emit('track', {streams:[stream(remote)]});
  };
  return {voice,states,calls,remote,doc,win,nav,audio,start,advance,remoteTrack,
    get mic(){return mic;},get pc(){return pc;},get timers(){return timers.size}};
}

test('offline event immediately stops active voice; online does not silently restart', async () => {
  const h=rig();await h.start();h.nav.onLine=false;h.win.emit('offline');
  assert.equal(h.voice.active,false);assert.equal(h.voice.lastStopReason,'interrupted_offline');
  assert.equal(h.mic.stops,1);assert.equal(h.pc.closes,1);assert.equal(h.timers,0);
  const requests=h.calls.length;h.nav.onLine=true;h.win.emit('online');
  assert.equal(h.calls.length,requests);
});

test('starting while offline never accesses microphone or requests credentials', async()=>{
 const h=rig({offlineInitially:true});await assert.rejects(h.start(),/session_stopped/);
 assert.equal(h.calls.length,0);assert.equal(h.voice.active,false);
});

test('microphone ended stops active session immediately',async()=>{
 const h=rig();await h.start();h.mic.end();
 assert.equal(h.voice.lastStopReason,'interrupted_mic_ended');assert.equal(h.pc.closes,1);
});

test('brief microphone mute recovers within 3 seconds without a new credential',async()=>{
 const h=rig();await h.start();const requests=h.calls.length;
 h.mic.mute();h.advance(2999);assert.equal(h.voice.active,true);
 h.mic.unmute();h.advance(5000);assert.equal(h.voice.active,true);
 assert.equal(h.calls.length,requests);h.voice.stop();assert.equal(h.timers,0);
});

test('microphone muted more than 3 seconds fails closed',async()=>{
 const h=rig();await h.start();h.mic.mute();h.advance(3000);
 assert.equal(h.voice.lastStopReason,'interrupted_mic_muted');assert.equal(h.mic.stops,1);
});

test('peer failed state stops instantly; no automatic retries',async()=>{
 const h=rig();await h.start();h.pc.state('failed');
 assert.equal(h.voice.lastStopReason,'interrupted_peer_failed');assert.equal(h.timers,0);
});

test('temporary peer disconnect can recover during short grace period',async()=>{
 const h=rig();await h.start();const requests=h.calls.length;
 h.pc.state('disconnected');h.advance(2999);h.pc.state('connected');h.advance(5000);
 assert.equal(h.voice.active,true);assert.equal(h.calls.length,requests);h.voice.stop();
});

test('peer disconnection longer than grace period stops and frees media',async()=>{
 const h=rig();await h.start();h.pc.state('disconnected');h.advance(3000);
 assert.equal(h.voice.lastStopReason,'interrupted_peer_disconnected');
 assert.equal(h.mic.stops,1);assert.equal(h.pc.closes,1);
});

test('ICE failed/closed stops immediately',async()=>{
 for (const state of ['failed','closed']) {
  const h=rig();await h.start();h.pc.ice(state);
  assert.equal(h.voice.lastStopReason,'interrupted_ice_failed');
 }
});

test('ICE disconnected then recovered via completed cancels the grace timer',async()=>{
 const h=rig();await h.start();h.pc.ice('disconnected');h.advance(1000);
 h.pc.ice('completed');h.advance(3000);assert.equal(h.voice.active,true);h.voice.stop();
});

test('ICE disconnection exceeds grace and stops',async()=>{
 const h=rig();await h.start();h.pc.ice('disconnected');h.advance(3000);
 assert.equal(h.voice.lastStopReason,'interrupted_ice_disconnected');
});

test('remote audio track ended stops session',async()=>{
 const h=rig();await h.start();h.remoteTrack();h.remote.end();
 assert.equal(h.voice.lastStopReason,'interrupted_remote_ended');
});

test('remote track mute/unmute recovers without ending call',async()=>{
 const h=rig();await h.start();h.remoteTrack();h.remote.mute();h.advance(1500);
 h.remote.unmute();h.advance(4000);assert.equal(h.voice.active,true);h.voice.stop();
});

test('remote track muted beyond grace period closes microphone',async()=>{
 const h=rig();await h.start();h.remoteTrack();h.remote.mute();h.advance(3000);
 assert.equal(h.voice.lastStopReason,'interrupted_remote_muted');
});

test('data channel close/error stops active session',async()=>{
 for (const event of ['close','error']) {
  const h=rig();await h.start();h.pc.channel.emit(event);
  assert.equal(h.voice.lastStopReason,event==='close'?'interrupted_channel_closed':'interrupted_channel_error');
 }
});

test('audio output error releases microphone',async()=>{
 const h=rig();await h.start();h.audio.emit('error');
 assert.equal(h.voice.lastStopReason,'interrupted_audio_error');assert.equal(h.mic.stops,1);
});

test('pagehide while waiting for microphone stops track returned late',async()=>{
 const micWait=defer(),h=rig({micWait});const starting=h.start();
 h.win.emit('pagehide');micWait.resolve(stream(h.mic));
 await assert.rejects(starting,/session_stopped/);
 assert.equal(h.mic.stops,1);assert.equal(h.calls.includes('backend'),false);
});

test('visibility hidden while microphone permission is pending fails closed',async()=>{
 const micWait=defer(),h=rig({micWait});const starting=h.start();
 h.doc.hidden=true;h.doc.emit('visibilitychange');micWait.resolve(stream(h.mic));
 await assert.rejects(starting,/session_stopped/);
 assert.equal(h.mic.stops,1);assert.equal(h.voice.lastStopReason,'hidden');
});

test('setup timeout interrupts pending microphone and closes late stream',async()=>{
 const micWait=defer(),h=rig({micWait});const starting=h.start();
 h.advance(20000);assert.equal(h.voice.lastStopReason,'setup_timeout');
 micWait.resolve(stream(h.mic));await assert.rejects(starting,/session_stopped/);
 assert.equal(h.mic.stops,1);assert.equal(h.timers,0);
});

test('setup timeout during provider request closes resources and denies late answer',async()=>{
 const providerWait=defer(),h=rig({providerWait});const starting=h.start();
 for(let i=0;i<20&&!h.calls.includes('provider');i++)await Promise.resolve();
 assert.equal(h.calls.includes('provider'),true);
 h.advance(20000);providerWait.resolve({ok:true,text:async()=> 'FAKE SDP'});
 await assert.rejects(starting,/session_stopped/);
 assert.equal(h.voice.lastStopReason,'setup_timeout');assert.equal(h.mic.stops,1);
});

test('UI callback throwing never leaks media resources',async()=>{
 const h=rig({throwUi:true});await h.start();h.win.emit('offline');
 assert.equal(h.voice.active,false);assert.equal(h.mic.stops,1);assert.equal(h.timers,0);
});

test('repeated disconnect events only schedule one grace timer',async()=>{
 const h=rig();await h.start();h.pc.state('disconnected');h.pc.state('disconnected');h.pc.state('disconnected');
 assert.equal(h.timers,2); // duration and one grace timer
 h.pc.state('connected');assert.equal(h.timers,1);h.voice.stop();
});

test('user stop cleans every event listener and pending grace timer',async()=>{
 const h=rig();await h.start();h.remoteTrack();h.mic.mute();h.pc.state('disconnected');
 h.voice.stop();assert.equal(h.timers,0);
 for(const obj of [h.mic,h.remote,h.pc,h.pc.channel,h.audio,h.win,h.doc])assert.equal(obj.count(),0);
});

test('stale event from stopped session cannot terminate a manually restarted one',async()=>{
 const h=rig();await h.start();const firstPeer=h.pc;h.voice.stop();await h.start();
 firstPeer.state('failed');assert.equal(h.voice.active,true);h.voice.stop();
});

test('remainingSeconds closes session after deadline if browser timer was throttled',async()=>{
 const h=rig();await h.start({seconds:120});h.advance(120000);
 assert.equal(h.voice.remainingSeconds(),0);assert.equal(h.voice.active,false);
});
