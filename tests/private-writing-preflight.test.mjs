import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import preflight from '../backend/private-writing-preflight.mjs';

const ORIGIN='https://aymen684-netizen.github.io';
const AUD='a'.repeat(64);
const WRONG_AUD='b'.repeat(64);
const EMAIL='owner@example.invalid';
const OWNER='owner-uuid-test-1234';
const DRAFT='Learning English regularly helps me describe my work and communicate with others.';
const goodBody={stage:'paragraph',level:'B1',draft:DRAFT};
function mockDB({throwError=false}={}){
 const seen=new Map(),history=[];
 return {
  history,
  prepare(sql){
   assert.match(sql,/INSERT INTO usage_daily/);
   assert.match(sql,/ON CONFLICT/);
   assert.match(sql,/WHERE used </);
   return {bind(day,owner,kind,limit){
    history.push({day,owner,kind,limit});
    return {async first(){
     if(throwError)throw new Error('db unavailable');
     const key=day+'|'+owner+'|'+kind;
     const n=seen.get(key)||0;
     if(n>=limit)return null;
     seen.set(key,n+1);
     return {used:n+1};
    }};
   }};
  }
 };
}
function env(db=mockDB(),overrides={}){
 return {STAGING_DRY_RUN_ENABLED:'true',STAGING_ACCESS_AUD:AUD,
  STAGING_OWNER_EMAIL:EMAIL,QUOTAS:db,...overrides};
}
function ctx(email=EMAIL,aud=AUD,uuid=OWNER){
 return {access:{aud,getIdentity:async()=>({email,user_uuid:uuid})}};
}
function req(path='/api/writing/preflight',{method='POST',origin=ORIGIN,body=goodBody,contentType='application/json',extraHeaders={}}={}){
 const headers=new Headers(extraHeaders);
 if(origin!==null)headers.set('Origin',origin);
 if(contentType!==null)headers.set('Content-Type',contentType);
 const init={method,headers};
 if(!['GET','HEAD'].includes(method)&&body!==undefined)init.body=typeof body==='string'?body:JSON.stringify(body);
 return new Request('https://staging.example'+path,init);
}
const response=(config=env(),context=ctx(),request=req())=>preflight.fetch(request,config,context);

test('dry-run is disabled by default without explicit environment configuration',async()=>{
 const r=await response({QUOTAS:mockDB()},ctx());
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'not_enabled');
});

test('explicit disabled flag still refuses requests',async()=>{
 const r=await response(env(mockDB(),{STAGING_DRY_RUN_ENABLED:'false'}));
 assert.equal(r.status,503);
});

test('missing configured staging Audience refuses requests',async()=>{
 const r=await response(env(mockDB(),{STAGING_ACCESS_AUD:''}));
 assert.equal(r.status,503);
});

test('malformed staging audience values cannot be used',async()=>{
 const r=await response(env(mockDB(),{STAGING_ACCESS_AUD:'not-a-valid-aud'}));
 assert.equal(r.status,503);
});

test('missing owner configuration refuses requests',async()=>{
 const r=await response(env(mockDB(),{STAGING_OWNER_EMAIL:''}));
 assert.equal(r.status,503);
});

test('missing D1 binding refuses requests',async()=>{
 const r=await response(env(null));
 assert.equal(r.status,503);
});

test('unauthenticated direct requests are rejected before reading drafts or charging quotas',async()=>{
 const db=mockDB();
 const r=await response(env(db),{});
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,'access_required');
 assert.equal(db.history.length,0);
});

test('an Access token audience for a different Worker is rejected',async()=>{
 const db=mockDB();
 const r=await response(env(db),ctx(EMAIL,WRONG_AUD));
 assert.equal(r.status,403);
 assert.equal(db.history.length,0);
});

test('Access identity for another email is rejected',async()=>{
 const r=await response(env(),ctx('different@example.invalid'));
 assert.equal(r.status,403);
});

test('missing opaque Cloudflare user UUID is rejected',async()=>{
 const r=await response(env(),ctx(EMAIL,AUD,null));
 assert.equal(r.status,403);
});

test('short nonopaque UUID is rejected',async()=>{
 const r=await response(env(),ctx(EMAIL,AUD,'a'));
 assert.equal(r.status,403);
});

test('identity lookup error fails closed',async()=>{
 const r=await response(env(),{access:{aud:AUD,getIdentity:async()=>{throw new Error('identity unavailable')}}});
 assert.equal(r.status,403);
});

test('requests from an untrusted Origin are rejected even with valid Access identity',async()=>{
 const r=await response(env(),ctx(),req('/api/writing/preflight',{origin:'https://untrusted.example'}));
 assert.equal(r.status,403);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});

test('OPTIONS from trusted Origin has narrow allowlist without invoking D1',async()=>{
 const db=mockDB();
 const r=await response(env(db),{},req('/api/writing/preflight',{method:'OPTIONS',body:undefined}));
 assert.equal(r.status,204);
 assert.equal(r.headers.get('access-control-allow-methods'),'POST,OPTIONS');
 assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 assert.equal(db.history.length,0);
});

test('OPTIONS from other Origins is rejected',async()=>{
 const r=await response(env(),{},req('/api/writing/preflight',{method:'OPTIONS',origin:'https://untrusted.example',body:undefined}));
 assert.equal(r.status,403);
});

test('unknown paths and unsupported methods return 404',async()=>{
 const a=await response(env(),ctx(),req('/health'));
 const b=await response(env(),ctx(),req('/api/writing/preflight',{method:'GET',body:undefined}));
 assert.equal(a.status,404);assert.equal(b.status,404);
});

test('non-JSON content type is rejected without consuming quota',async()=>{
 const db=mockDB();
 const r=await response(env(db),ctx(),req('/api/writing/preflight',{contentType:'text/plain'}));
 assert.equal(r.status,415);
 assert.equal(db.history.length,0);
});

test('malformed JSON and JSON array are rejected without consuming quota',async()=>{
 const db=mockDB();
 for(const body of ['{ broken','[]']){
  const r=await response(env(db),ctx(),req('/api/writing/preflight',{body}));
  assert.equal(r.status,400);
 }
 assert.equal(db.history.length,0);
});

test('invalid draft length and whitespace-only drafts are refused',async()=>{
 const db=mockDB();
 for(const draft of ['tiny',' '.repeat(50),'x'.repeat(6001)]){
  const r=await response(env(db),ctx(),req('/api/writing/preflight',{body:{...goodBody,draft}}));
  assert.equal(r.status,400);
 }
 assert.equal(db.history.length,0);
});

test('unknown writing stage and level values are refused',async()=>{
 const db=mockDB();
 for(const override of [{stage:'admin'},{level:'Z9'},{stage:null}]){
  const r=await response(env(db),ctx(),req('/api/writing/preflight',{body:{...goodBody,...override}}));
  assert.equal(r.status,400);
 }
 assert.equal(db.history.length,0);
});

test('oversize request is stopped by a bounded streaming read without Content-Length',async()=>{
 const db=mockDB();
 const oversized=JSON.stringify({...goodBody,draft:'x'.repeat(14000)});
 const request=req('/api/writing/preflight',{body:oversized});
 assert.equal(request.headers.get('content-length'),null,'must exercise streaming limit');
 const r=await response(env(db),ctx(),request);
 assert.equal(r.status,413);
 assert.equal(db.history.length,0);
});

test('declared Content-Length beyond maximum is rejected before reading body',async()=>{
 const db=mockDB();
 const request=req('/api/writing/preflight',{extraHeaders:{'Content-Length':'999999'}});
 const r=await response(env(db),ctx(),request);
 assert.equal(r.status,413);
 assert.equal(db.history.length,0);
});

test('valid private dry-run returns only stage/level/quota and does not expose drafts',async()=>{
 const db=mockDB();
 const r=await response(env(db));
 assert.equal(r.status,200);
 const result=await r.json();
 assert.equal(result.accepted,true);
 assert.equal(result.paidAiEnabled,false);
 assert.equal(result.dryRun,true);
 assert.deepEqual(result.validated,{stage:'paragraph',level:'B1'});
 assert.equal(result.quota.remaining,9);
 const raw=JSON.stringify(result);
 for(const secret of [DRAFT,EMAIL,OWNER,AUD])assert.equal(raw.includes(secret),false);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.equal(db.history[0].owner,OWNER,'store opaque UUID not email');
});

test('quota allows exactly 10 dry-run reservations and rejects the 11th',async()=>{
 const db=mockDB(),configuration=env(db);
 for(let i=0;i<10;i++){
  const r=await response(configuration);
  assert.equal(r.status,200,'request '+(i+1));
  assert.equal((await r.json()).quota.remaining,9-i);
 }
 const denied=await response(configuration);
 assert.equal(denied.status,429);
 const result=await denied.json();
 assert.equal(result.error,'daily_quota_exhausted');
 assert.equal(result.paidAiEnabled,false);
 assert.equal(db.history.length,11);
});

test('database errors fail closed and do not leak diagnostics',async()=>{
 const r=await response(env(mockDB({throwError:true})));
 assert.equal(r.status,503);
 const result=await r.json();
 assert.equal(result.error,'quota_unavailable');
 assert.equal(JSON.stringify(result).includes('db unavailable'),false);
});

test('source cannot call OpenAI or network and does not log drafts',()=>{
 const source=readFileSync(new URL('../backend/private-writing-preflight.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:await|return)\s+fetch\s*\(|globalThis\.fetch\s*\(|api\.openai\.com|console\.|\.textContent\s*=/);
 assert.doesNotMatch(source,/\bOPENAI_API_KEY\b|\bADMIN_TEST_TOKEN\b/);
});
