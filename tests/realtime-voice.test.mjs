import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession } from '../src/realtime-voice.js';

function harness(overrides = {}) {
  let now = 0, id = 0, stoppedTracks = 0, closedPeers = 0, closedChannels = 0;
  const timeouts = new Map(), calls = [], states = [];
  const listeners = new Map();
  const media = { async getUserMedia(options) { calls.push(['microphone',options]);
    if (overrides.denyMic) throw Error('denied');
    return { getTracks: () => [{ stop() { stoppedTracks++; } }] }; } };
  class Peer {
    addTrack() {};
    createDataChannel() { return { close(){ closedChannels++; } }; }
    async createOffer() { return { sdp: 'FAKE SDP', type: 'offer' }; }
    async setLocalDescription() {};
    async setRemoteDescription() {};
    close(){ closedPeers++; }
  }
  const fetcher = async (url,opts) => {
    calls.push(['fetch',url,opts.method]);
    if (overrides.blockBackend && !url.includes('/v1/realtime/')) return {ok:false};
    if (overrides.blockProvider && url.includes('/v1/realtime/')) return {ok:false};
    if (url.includes('/v1/realtime/')) return {ok:true,text:async()=> 'FAKE ANSWER'};
    return {ok:true,json:async()=>({client_secret:{value:'fake_ephemeral_for_tests'}})};
  };
  const doc={hidden:false,addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)};
  const win={addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)};
  const audio={srcObject:null,pause(){}};
  const deps={fetch:fetcher,mediaDevices:media,RTCPeerConnection:Peer,
    makeAudio:()=>audio,now:()=>now,setTimeout(fn,ms){const key=++id;timeouts.set(key,{fn,at:now+ms});return key;},
    clearTimeout(key){timeouts.delete(key);},document:doc,window:win};
  const voice=new VoiceSession('https://english-plus-ai-staging.example/api/speaking/session',x=>states.push(x),deps);
  const advance=ms=>{now+=ms;for(const [key,item] of [...timeouts])if(item.at<=now){timeouts.delete(key);item.fn();}};
  return {voice,advance,doc,listeners,states,calls,get stoppedTracks(){return stoppedTracks},get closedPeers(){return closedPeers},get closedChannels(){return closedChannels},get timers(){return timeouts.size}};
}
for(const seconds of [120,180,300]){
  test(seconds+'s: voice starts then stops at deadline, closing all resources',async()=>{
    const h=harness();await h.voice.start({topic:'travel',level:'B1',seconds});
    assert.equal(h.voice.active,true);assert.equal(h.voice.remainingSeconds(),seconds);
    h.advance(seconds*1000-1000);assert.equal(h.voice.active,true);
    assert.equal(h.voice.remainingSeconds(),1);
    h.advance(1000);assert.equal(h.voice.active,false);assert.deepEqual(h.states,['connecting','live','stopped']);
    assert.equal(h.stoppedTracks,1);assert.equal(h.closedPeers,1);assert.equal(h.closedChannels,1);
    assert.equal(h.timers,0);assert.equal(h.listeners.size,0);
  });
}
test('manual stop closes media immediately and is idempotent',async()=>{
  const h=harness();await h.voice.start({topic:'intro',seconds:300});h.voice.stop();h.voice.stop();
  assert.equal(h.stoppedTracks,1);assert.equal(h.timers,0);assert.equal(h.voice.active,false);
});
test('pagehide closes voice and removes event listeners',async()=>{
 const h=harness();await h.voice.start({topic:'work'});h.listeners.get('pagehide')();
 assert.equal(h.voice.active,false);assert.equal(h.stoppedTracks,1);assert.equal(h.listeners.size,0);
});
test('background tab stops the microphone',async()=>{
 const h=harness();await h.voice.start({topic:'study'});h.doc.hidden=true;h.listeners.get('visibilitychange')();
 assert.equal(h.voice.active,false);assert.equal(h.stoppedTracks,1);
});
test('invalid options are rejected before permission or network access',async()=>{
 const h=harness();for (const seconds of [0,60,119,301,3600])
   await assert.rejects(()=>h.voice.start({topic:'travel',seconds}),/invalid_options/);
 await assert.rejects(()=>h.voice.start({topic:'not-allowed',seconds:120}),/invalid_options/);
 assert.equal(h.calls.length,0);
});
test('rejects insecure API endpoint before permission',async()=>{
 const h=harness();h.voice.endpoint='http://insecure.example/sessions';
 await assert.rejects(()=>h.voice.start({topic:'intro'}),/backend_not_configured/);
 assert.equal(h.calls.length,0);
});
test('denied microphone permission does not mint an ephemeral secret',async()=>{
 const h=harness({denyMic:true});await assert.rejects(()=>h.voice.start({topic:'intro'}),/session_start_failed/);
 assert.equal(h.calls.filter(x=>x[0]==='fetch').length,0);assert.equal(h.voice.active,false);
});
test('unauthorized backend denies voice and closes the mic',async()=>{
 const h=harness({blockBackend:true});await assert.rejects(()=>h.voice.start({topic:'intro'}),/session_not_authorized/);
 assert.equal(h.stoppedTracks,1);assert.equal(h.calls.some(x=>x[0]==='fetch'&&x[1].includes('/v1/realtime/')),false);
});
test('provider failure closes peer, channel and microphone',async()=>{
 const h=harness({blockProvider:true});await assert.rejects(()=>h.voice.start({topic:'intro'}),/realtime_connection_failed/);
 assert.equal(h.stoppedTracks,1);assert.equal(h.closedPeers,1);assert.equal(h.closedChannels,1);
});
test('cannot start overlapping sessions',async()=>{
 const h=harness();await h.voice.start({topic:'intro'});
 await assert.rejects(()=>h.voice.start({topic:'work'}),/already_started/);
 h.voice.stop();
});
test('no audio is recorded, stored or sent to backend session minting',async()=>{
 const h=harness();await h.voice.start({topic:'intro',level:'A1',seconds:120});
 const backend=h.calls.find(x=>x[0]==='fetch'&&!x[1].includes('openai.com'));
 assert.deepEqual(backend.slice(0,3),['fetch','https://english-plus-ai-staging.example/api/speaking/session','POST']);
 assert.equal(h.calls.filter(x=>x[0]==='fetch').length,2);h.voice.stop();
});

test('stop while microphone permission is pending closes late-acquired track', async () => {
  let resolveMic, stopped = 0, apiCalls = 0;
  const voice = new VoiceSession('https://staging.example/api/speaking/session', () => {}, {
    mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveMic = resolve; }) },
    RTCPeerConnection: class {},
    fetch: async () => { apiCalls++; throw Error('must_not_call'); }
  });
  const pending = voice.start({topic:'intro',seconds:120});
  voice.stop();
  resolveMic({ getTracks: () => [{ stop() { stopped++; } }] });
  await assert.rejects(pending,/session_stopped/);
  assert.equal(stopped,1);
  assert.equal(apiCalls,0);
});

test('stop while backend authorization is pending prevents opening a peer connection', async () => {
  let resolveRequest, stopped=0, createdPeer=0;
  const voice = new VoiceSession('https://staging.example/api/speaking/session', () => {}, {
    mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},
    RTCPeerConnection: class {constructor(){createdPeer++;}},
    fetch: () => new Promise(resolve => { resolveRequest = resolve; })
  });
  const pending=voice.start({topic:'intro',seconds:120});
  await Promise.resolve();
  assert.equal(typeof resolveRequest,'function');
  voice.stop();
  resolveRequest({ok:true,json:async()=>({client_secret:{value:'fake_ephemeral_for_tests'}})});
  await assert.rejects(pending,/session_stopped/);
  assert.equal(createdPeer,0);
  assert.equal(stopped,1);
});

test('missing ephemeral credential is rejected without connecting to provider',async()=>{
  const h=harness();
  let stopped=0,providerCalls=0;
  const voice=new VoiceSession('https://staging.example/api/speaking/session',()=>{}, {
    mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},
    RTCPeerConnection: class {},
    fetch:async url=>{if(url.includes('openai.com'))providerCalls++;return {ok:true,json:async()=>({client_secret:{value:''}})};}
  });
  await assert.rejects(()=>voice.start({topic:'travel'}),/invalid_session/);
  assert.equal(providerCalls,0);assert.equal(stopped,1);assert.equal(h.calls.length,0);
});
