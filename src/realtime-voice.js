export class VoiceSession {
 constructor(endpoint,onState=()=>{}){this.endpoint=endpoint;this.onState=onState;}
 async start({topic,level='A1',seconds=120}){
  if(this.pc)throw Error('already_started');
  if(!['intro','travel','work','study'].includes(topic)||![120,180,300].includes(seconds)||!['A1','A2','B1','B2','C1'].includes(level))throw Error('invalid_options');
  if(!this.endpoint?.startsWith('https://'))throw Error('backend_not_configured');
  try{
   const r=await fetch(this.endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,level,seconds})});
   if(!r.ok)throw Error('session_not_authorized');
   const data=await r.json(),secret=data.client_secret?.value;
   if(typeof secret!=='string')throw Error('invalid_session');
   this.stream=await navigator.mediaDevices.getUserMedia({audio:true});
   this.pc=new RTCPeerConnection();this.stream.getTracks().forEach(t=>this.pc.addTrack(t,this.stream));
   this.audio=new Audio();this.audio.autoplay=true;this.pc.ontrack=e=>this.audio.srcObject=e.streams[0];
   this.channel=this.pc.createDataChannel('oai-events');
   const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);
   const answer=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/sdp'},body:offer.sdp});
   if(!answer.ok)throw Error('realtime_connection_failed');
   await this.pc.setRemoteDescription({type:'answer',sdp:await answer.text()});
   this.timer=setTimeout(()=>this.stop(),seconds*1000);this.onState('live');
  }catch(e){this.stop();throw e;}
 }
 stop(){clearTimeout(this.timer);this.channel?.close();this.pc?.close();this.stream?.getTracks().forEach(t=>t.stop());if(this.audio){this.audio.pause();this.audio.srcObject=null;}this.pc=null;this.stream=null;this.channel=null;this.onState('stopped');}
}
