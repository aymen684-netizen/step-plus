import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../backend/worker-staging.js';

// Staging-only contract: synthetic requests, identity mocks and no external HTTP.
// This suite does not prove real Cloudflare Access sessions or deployment parity.
const ORIGIN='https://aymen684-netizen.github.io';
const OWNER='aymen684@gmail.com';
const STAGING_AUD='ae04af66e40b398431006c55c4d2c282b6decf81afffc6f93d1a5ffbddca8d80';
const PROD_AUD='0dbb2f48add6b4973115ffb89fb3c1e98aa7bdc5726c13272211fbdb1b3d6a1f';
const req=(path,method='GET',origin=ORIGIN)=>new Request('https://staging.invalid'+path,{method,headers:origin?{Origin:origin}:{}});
const ownerCtx=(aud=STAGING_AUD,email=OWNER)=>({access:{aud,getIdentity:async()=>({email})}});

test('unauthenticated health and both paid API routes fail closed',async()=>{
 for(const [path,method] of [['/health','GET'],['/api/writing/review','POST'],['/api/speaking/session','POST']]){
  const r=await worker.fetch(req(path,method),{},{});
  assert.equal(r.status,403,path);
  assert.equal((await r.json()).error,'access_required');
 }
});

test('forged allowed Origin never replaces Access authorization',async()=>{
 const r=await worker.fetch(req('/api/auth/status','GET',ORIGIN),{},{});
 assert.equal(r.status,403);
});

test('production audience is rejected on every protected route',async()=>{
 for(const [path,method] of [['/health','GET'],['/api/auth/status','GET'],['/api/writing/review','POST']]){
  const r=await worker.fetch(req(path,method),{},ownerCtx(PROD_AUD));
  assert.equal(r.status,403,path);
 }
});

test('owner health gives non-billable status without echoing identity',async()=>{
 const r=await worker.fetch(req('/health'),{},ownerCtx());
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.paidAiEnabled,false);
 assert.equal(data.authentication,'required');
 assert.equal(JSON.stringify(data).includes(OWNER),false);
 assert.equal(r.headers.get('cache-control'),'no-store');
});

test('owner speaking and writing POST remain disabled without accessing D1',async()=>{
 const env={get QUOTAS(){throw Error('must not open D1')}};
 for(const path of ['/api/writing/review','/api/speaking/session']){
  const r=await worker.fetch(req(path,'POST'),env,ownerCtx());
  assert.equal(r.status,503,path);
  assert.equal((await r.json()).error,'ai_disabled_pending_usage_limits');
 }
});

test('unknown or wrong-method endpoints never report authenticated session',async()=>{
 for(const [path,method] of [['/api/auth/status','POST'],['/api/writing/review','GET'],['/api/admin/self-test','POST'],['/this-path-does-not-exist','GET']]){
  const r=await worker.fetch(req(path,method),{},ownerCtx());
  assert.equal(r.status,404,path);
  assert.equal((await r.json()).error,'not_found');
 }
});

test('cross-origin preflight rejects unapproved origins',async()=>{
 for(const origin of ['https://evil.example','https://aymen684-netizen.github.io.evil.example']){
  const r=await worker.fetch(req('/api/writing/review','OPTIONS',origin),{},{});
  assert.equal(r.status,403);
  assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
});

test('allowed origin preflight is bounded to GET POST OPTIONS without credentials',async()=>{
 const r=await worker.fetch(req('/api/writing/review','OPTIONS'),{},{});
 assert.equal(r.status,204);
 assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 assert.equal(r.headers.get('access-control-allow-methods'),'GET,POST,OPTIONS');
 assert.equal(r.headers.get('access-control-allow-headers'),'Content-Type');
});

test('staging source has no paid-provider integration or request-body storage',()=>{
 const source=readFileSync(new URL('../backend/worker-staging.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/api\.openai\.com|OPENAI_API_KEY|request\.text\(|request\.json\(|localStorage|sessionStorage/);
 assert.match(source,/paidAiEnabled:false/);
});
