import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker-staging.js';

// Audience verified against the staging Cloudflare Access application on 2026-10-24.
const STAGING_AUD='ae04af66e40b398431006c55c4d2c282b6decf81afffc6f93d1a5ffbddca8d80';
const PROD_AUD='0dbb2f48add6b4973115ffb89fb3c1e98aa7bdc5726c13272211fbdb1b3d6a1f';
const OWNER='aymen684@gmail.com';
const ORIGIN='https://aymen684-netizen.github.io';
const req=(path,method='GET',origin=ORIGIN)=>new Request(`https://staging.test${path}`,{method,headers:{Origin:origin}});
const ctx=(email=OWNER,aud=STAGING_AUD)=>({access:{aud,getIdentity:async()=>({email})}});

test('rejects unauthenticated requests even with trusted Origin',async()=>{
 const r=await worker.fetch(req('/api/auth/status'),{},{});
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,'access_required');
});
test('rejects production Access token audience at staging',async()=>{
 const r=await worker.fetch(req('/api/auth/status'),{},ctx(OWNER,PROD_AUD));
 assert.equal(r.status,403);
});
test('rejects another account with correct staging audience',async()=>{
 const r=await worker.fetch(req('/api/auth/status'),{},ctx('other@example.org'));
 assert.equal(r.status,403);
});
test('rejects identity retrieval errors',async()=>{
 const r=await worker.fetch(req('/api/auth/status'),{}, {access:{aud:STAGING_AUD,getIdentity:async()=>{throw Error('denied')}}});
 assert.equal(r.status,403);
});
test('accepts staging owner and reports paid AI disabled',async()=>{
 const r=await worker.fetch(req('/api/auth/status'),{},ctx());
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{authenticated:true,owner:true,paidAiEnabled:false});
});
test('refuses paid writing requests until usage limits are ready',async()=>{
 const r=await worker.fetch(req('/api/writing/review','POST'),{},ctx());
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'ai_disabled_pending_usage_limits');
});
test('rejects preflight from untrusted origin',async()=>{
 const r=await worker.fetch(req('/api/writing/review','OPTIONS','https://attacker.example'),{},{});
 assert.equal(r.status,403);
});
test('allows preflight from configured frontend origin only',async()=>{
 const r=await worker.fetch(req('/api/writing/review','OPTIONS'),{},{});
 assert.equal(r.status,204);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
});
