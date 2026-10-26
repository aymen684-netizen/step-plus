// Read-only public perimeter test. No authorization, cookies, user drafts, bodies,
// OpenAI calls, production hostname or Cloudflare API changes are permitted.
import assert from 'node:assert/strict';

const HOST='english-plus-ai-staging.aymen684.workers.dev';
const LOGIN='lingering-bread-cdac.cloudflareaccess.com';
const probes=[
 ['GET','/health'],['GET','/api/auth/status'],
 ['GET','/api/writing/review'],['GET','/missing-protected-path'],
 ['POST','/api/writing/review'],['POST','/api/speaking/session']
];
let totalGet=0,totalPost=0;
for (let i=0;i<probes.length;i++){
 const [method,path]=probes[i];
 const url=new URL(path,'https://'+HOST);
 assert.equal(url.hostname,HOST);
 const response=await fetch(url,{method,redirect:'manual',credentials:'omit',
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 const loc=response.headers.get('location');
 let validLogin=false;
 if(loc){
  const target=new URL(loc,url);
  validLogin=(target.protocol==='https:' &&
   (target.hostname===LOGIN||target.hostname===HOST) &&
   target.pathname.startsWith('/cdn-cgi/access/'));
 }
 // Never include redirect queries, response body, identity, or cookie in logs.
 console.log('PROBE_'+String(i+1).padStart(2,'0')+' '+method+' HTTP_'+response.status+
  ' ACCESS_CHALLENGE_'+String(validLogin));
 assert.equal(response.status,302,'Access login challenge required for probe '+(i+1));
 assert.equal(validLogin,true,'Only exact account Access login redirect accepted');
 if(method==='GET')totalGet++;else totalPost++;
}
assert.equal(totalGet,4);
assert.equal(totalPost,2);
console.log('STAGING_ANONYMOUS_ACCESS_CHALLENGES=6/6; GET=4/4; POST=2/2');
