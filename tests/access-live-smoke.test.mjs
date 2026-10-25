import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBES,classifyUnauthenticated,probeOne} from './access-live-smoke.mjs';

const url='https://english-plus-ai.aymen684.workers.dev/health';
const evaluate=(status,location)=>classifyUnauthenticated({status,location,requestUrl:url});

test('read-only target list uses GET-safe routes and known Workers',()=>{
 assert.equal(PROBES.length,4);
 const names=new Set(PROBES.map(x=>x.id));
 assert.equal(names.size,4);
 for(const target of PROBES){
  const p=new URL(target.url);
  assert.equal(p.protocol,'https:');
  assert.ok(['english-plus-ai.aymen684.workers.dev','english-plus-ai-staging.aymen684.workers.dev'].includes(p.hostname));
  assert.ok(['/health','/api/auth/status','/api/admin/self-test'].includes(p.pathname));
  assert.ok(!p.search);
 }
});

test('401 or 403 counts as HTTP denial but not verified Access attribution',()=>{
 for(const status of [401,403]){
  const x=evaluate(status,null);
  assert.equal(x.accepted,true);
  assert.equal(x.outcome,'HTTP_DENIED_NOT_ACCESS_ATTRIBUTED');
 }
});

test('Access login redirects are accepted',()=>{
 const a=evaluate(302,'https://aymen684.cloudflareaccess.com/cdn-cgi/access/login/path');
 assert.equal(a.accepted,true);
 assert.equal(a.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
 const b=evaluate(302,'/cdn-cgi/access/login/myapp');
 assert.equal(b.accepted,true);
});

test('redirects to unrelated hosts or unprotected app paths are rejected',()=>{
 for(const loc of [
  'https://example.com/sign-in',
  'https://aymen684.cloudflareaccess.com.evil.test/login',
  'https://english-plus-ai.aymen684.workers.dev/',
  'http://aymen684.cloudflareaccess.com/cdn-cgi/access/login',
  'javascript:alert(1)'
 ]){
  assert.equal(evaluate(302,loc).accepted,false,loc);
 }
});

test('malformed redirect locations are rejected',()=>{
 assert.equal(evaluate(302,'http://[').accepted,false);
 assert.equal(evaluate(302,null).accepted,false);
});

test('200 and 204 responses are SECURITY FAILURES, not successes',()=>{
 for(const status of [200,201,204]){
  const v=evaluate(status,null);
  assert.equal(v.accepted,false);
  assert.equal(v.outcome,'UNAUTHENTICATED_2XX_SECURITY_FAILURE');
 }
});

test('404 is not proof of Access protection',()=>{
 const v=evaluate(404,null);
 assert.equal(v.accepted,false);
 assert.equal(v.outcome,'UNAUTHENTICATED_404_BYPASS_SUSPECTED');
});

test('500, 502, 503 are inconclusive, not proof of denial',()=>{
 for(const status of [500,502,503,530]){
  const v=evaluate(status,null);
  assert.equal(v.accepted,false);
  assert.equal(v.outcome,'UPSTREAM_ERROR_INCONCLUSIVE');
 }
});

test('live probe sends GET only with no authorization, cookies, body or redirect following',async()=>{
 let calls=0;
 const mock=async (calledUrl,init)=>{
  calls++;
  assert.equal(calledUrl,url);
  assert.equal(init.method,'GET');
  assert.equal(init.credentials,'omit');
  assert.equal(init.redirect,'manual');
  assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.headers.Cookie,undefined);
  assert.equal(init.body,undefined);
  return new Response(null,{status:302,headers:{location:'/cdn-cgi/access/login/app'}});
 };
 const got=await probeOne({id:'unit-test',url},{fetchImpl:mock});
 assert.equal(calls,1);
 assert.equal(got.http_status,302);
 assert.equal(got.accepted,true);
 assert.equal(got.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
});

test('DNS / network errors are NOT misclassified as a passed test',async()=>{
 const fetchImpl=async()=>{const err=new Error('redacted-hostname');err.cause={code:'ENOTFOUND'};throw err;};
 const result=await probeOne({id:'unit-test',url},{fetchImpl});
 assert.equal(result.accepted,false);
 assert.equal(result.outcome,'NETWORK_INCONCLUSIVE');
 assert.equal(result.error_code,'ENOTFOUND');
 assert.equal(JSON.stringify(result).includes('redacted-hostname'),false);
});

test('an unauthenticated 200 returned from the live probe is flagged as a failure',async()=>{
 const result=await probeOne({id:'test',url},{fetchImpl:async()=>new Response('{}',{status:200})});
 assert.equal(result.accepted,false);
 assert.equal(result.outcome,'UNAUTHENTICATED_2XX_SECURITY_FAILURE');
});
