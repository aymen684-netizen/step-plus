// English+ unauthenticated HTTP read-only Access verification.
// Uses exactly twelve GET requests without cookies, credentials, request bodies or redirects; four include synthetic forged identity headers.
// This script NEVER touches /api/writing/review with POST or calls the AI provider.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PROBES=Object.freeze([
 {id:'production-health',url:'https://english-plus-ai.aymen684.workers.dev/health'},
 {id:'production-admin-get',url:'https://english-plus-ai.aymen684.workers.dev/api/admin/self-test'},
 {id:'staging-health',url:'https://english-plus-ai-staging.aymen684.workers.dev/health'},
 {id:'staging-auth-status',url:'https://english-plus-ai-staging.aymen684.workers.dev/api/auth/status'},
 {id:'production-writing-get',url:'https://english-plus-ai.aymen684.workers.dev/api/writing/review'},
 {id:'staging-writing-get',url:'https://english-plus-ai-staging.aymen684.workers.dev/api/writing/review'},
 {id:'production-unknown-route',url:'https://english-plus-ai.aymen684.workers.dev/englishplus-unexpected-route-probe'},
 {id:'staging-unknown-route',url:'https://english-plus-ai-staging.aymen684.workers.dev/englishplus-unexpected-route-probe'},
 {id:'production-health-spoof',url:'https://english-plus-ai.aymen684.workers.dev/health',spoof:true},
 {id:'staging-health-spoof',url:'https://english-plus-ai-staging.aymen684.workers.dev/health',spoof:true},
 {id:'production-writing-spoof',url:'https://english-plus-ai.aymen684.workers.dev/api/writing/review',spoof:true},
 {id:'staging-writing-spoof',url:'https://english-plus-ai-staging.aymen684.workers.dev/api/writing/review',spoof:true}
]);

export function classifyUnauthenticated({status,location,requestUrl}){
 const requestHost=new URL(requestUrl).hostname.toLowerCase();
 if(status===401||status===403){
  // Denial may come from the Worker itself even if Access is bypassed.
  // For this Access-specific gate, only a verified Access challenge counts.
  return {accepted:false,outcome:'HTTP_DENIED_NOT_ACCESS_ATTRIBUTED'};
 }
 if([301,302,303,307,308].includes(status)){
  let target;
  try{target=new URL(location,requestUrl)}catch{return {accepted:false,outcome:'INVALID_REDIRECT'};}
  const host=target.hostname.toLowerCase();
  const onAccessHost=host==='lingering-bread-cdac.cloudflareaccess.com' && target.pathname.startsWith('/cdn-cgi/access/');
  const onAppAccessPath=host===requestHost && target.pathname.startsWith('/cdn-cgi/access/');
  if(target.protocol==='https:'&&(onAccessHost||onAppAccessPath))
   return {accepted:true,outcome:'CLOUDFLARE_ACCESS_CHALLENGE'};
  return {accepted:false,outcome:'UNRELATED_REDIRECT'};
 }
 if(status>=200&&status<300)return {accepted:false,outcome:'UNAUTHENTICATED_2XX_SECURITY_FAILURE'};
 if(status===404)return {accepted:false,outcome:'UNAUTHENTICATED_404_BYPASS_SUSPECTED'};
 if(status>=500)return {accepted:false,outcome:'UPSTREAM_ERROR_INCONCLUSIVE'};
 return {accepted:false,outcome:'UNEXPECTED_HTTP_STATUS'};
}

export async function probeOne(probe,{fetchImpl=fetch}={}){
 const opts={
  method:'GET', redirect:'manual', credentials:'omit',
  headers:{Accept:'application/json',...(probe.spoof===true?{
   // Deliberately UNTRUSTED client-supplied identity claims; never send a real identity.
   'Cf-Access-Authenticated-User-Email':'synthetic-attacker@example.invalid',
   'X-Forwarded-Email':'synthetic-attacker@example.invalid',
   'X-Forwarded-User':'synthetic-attacker@example.invalid'
  }:{})},
  signal:AbortSignal.timeout(12000)
 };
 try{
  const response=await fetchImpl(probe.url,opts);
  const classified=classifyUnauthenticated({
   status:response.status,
   location:response.headers.get('location'),
   requestUrl:probe.url
  });
  // Do not read response bodies, log IP/cookies, or print redirect query parameters.
  return {id:probe.id,http_status:response.status,...classified};
 }catch(error){
  const errCode=error?.cause?.code||error?.name||'NETWORK_ERROR';
  return {id:probe.id,http_status:null,accepted:false,outcome:'NETWORK_INCONCLUSIVE',error_code:String(errCode).slice(0,80)};
 }
}

export async function run(){
 const results=await Promise.all(PROBES.map(x=>probeOne(x)));
 for(const item of results)console.log(JSON.stringify(item));
 const accepted=results.filter(x=>x.accepted).length;
 console.log('HTTP_DENIAL_CHECKS='+accepted+'/'+results.length);
 if(accepted!==results.length)process.exitCode=1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
