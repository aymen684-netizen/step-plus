import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBES,classifyUnauthenticated,probeOne} from './access-live-smoke.mjs';

const url='https://english-plus-ai.aymen684.workers.dev/health';
const evaluate=(status,location)=>classifyUnauthenticated({status,location,requestUrl:url});

test('read-only target list uses GET-safe routes and known Workers',()=>{
 assert.equal(PROBES.length,12);
 const names=new Set(PROBES.map(x=>x.id));
 assert.equal(names.size,12);
 for(const target of PROBES){
  const p=new URL(target.url);
  assert.equal(p.protocol,'https:');
  assert.ok(['english-plus-ai.aymen684.workers.dev','english-plus-ai-staging.aymen684.workers.dev'].includes(p.hostname));
  assert.ok(['/health','/api/auth/status','/api/admin/self-test','/api/writing/review','/englishplus-unexpected-route-probe'].includes(p.pathname));
  assert.ok(!p.search);
 }
});

test('401 or 403 is a denial but NOT proof that Access ran',()=>{
 for(const status of [401,403]){
  const x=evaluate(status,null);
  assert.equal(x.accepted,false);
  assert.equal(x.outcome,'HTTP_DENIED_NOT_ACCESS_ATTRIBUTED');
 }
});

test('Access login redirects are accepted',()=>{
 const a=evaluate(302,'https://lingering-bread-cdac.cloudflareaccess.com/cdn-cgi/access/login/path');
 assert.equal(a.accepted,true);
 assert.equal(a.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
 const b=evaluate(302,'/cdn-cgi/access/login/myapp');
 assert.equal(b.accepted,true);
});

test('redirects to unrelated hosts or unprotected app paths are rejected',()=>{
 for(const loc of [
  'https://example.com/sign-in',
  'https://some-other-tenant.cloudflareaccess.com/cdn-cgi/access/login',
  'https://aymen684.cloudflareaccess.com.evil.test/login',
  'https://english-plus-ai.aymen684.workers.dev/',
  'http://lingering-bread-cdac.cloudflareaccess.com/cdn-cgi/access/login',
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


test('expanded route set includes both writing and unknown-path probes',()=>{
 for(const host of ['english-plus-ai.aymen684.workers.dev','english-plus-ai-staging.aymen684.workers.dev']){
  const filtered=PROBES.filter(x=>new URL(x.url).hostname===host);
  assert.ok(filtered.some(x=>new URL(x.url).pathname==='/api/writing/review'));
  assert.ok(filtered.some(x=>new URL(x.url).pathname==='/englishplus-unexpected-route-probe'));
  assert.ok(filtered.every(x=>new URL(x.url).search===''));
 }
});

test('four synthetically spoofed-identity GET probes cover both Worker hosts',()=>{
 const spoofs=PROBES.filter(p=>p.spoof===true);
 assert.equal(spoofs.length,4);
 for(const host of ['english-plus-ai.aymen684.workers.dev','english-plus-ai-staging.aymen684.workers.dev']){
  const requests=spoofs.filter(p=>new URL(p.url).hostname===host);
  assert.deepEqual(requests.map(p=>new URL(p.url).pathname).sort(), ['/api/writing/review','/health']);
 }
});

test('spoof probes contain only fixed fake identity headers and never credentials or bodies',async()=>{
 const p=PROBES.find(q=>q.id==='production-health-spoof');
 const mock=async (_url,opts)=>{
  assert.equal(opts.method,'GET');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.body,undefined);
  assert.equal(opts.headers['Cf-Access-Authenticated-User-Email'],'synthetic-attacker@example.invalid');
  assert.equal(opts.headers['X-Forwarded-Email'],'synthetic-attacker@example.invalid');
  assert.equal(opts.headers['X-Forwarded-User'],'synthetic-attacker@example.invalid');
  assert.equal(opts.headers.Authorization,undefined);
  assert.equal(opts.headers.Cookie,undefined);
  return new Response(null,{status:302,headers:{Location:'/cdn-cgi/access/login'}});
 };
 const result=await probeOne(p,{fetchImpl:mock});
 assert.equal(result.accepted,true);
 assert.equal(result.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
 assert.equal(JSON.stringify(result).includes('synthetic-attacker'),false);
});
