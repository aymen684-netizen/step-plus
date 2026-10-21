import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/quota-test-worker.mjs';

// In-memory mock implementing the same D1 prepare/bind/first interface.
// These tests validate app behavior, not Cloudflare D1 concurrency guarantees.
function mockDB(){
 const state=new Map();
 return {prepare(){return {bind(day,owner,kind,limit){return {async first(){
  const key=[day,owner,kind].join(':');
  const used=state.get(key)||0;if(used>=limit)return null;
  state.set(key,used+1);return {used:used+1};
 }}}}}};
}
const AUD='ae04af66e40b398431006c55c4d2c282b6decf81afffc6f93d1a5ffbddca8d80';
function ctx(email='aymen684@gmail.com',aud=AUD){return {access:{aud,getIdentity:async()=>({email})}};}
function req(kind){return new Request('https://staging.test/api/quota/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind})});}
test('rejects requests without Access',async()=>{const r=await worker.fetch(req('writing'),{QUOTAS:mockDB()},{}) ;assert.equal(r.status,403);});
test('rejects wrong Access audience',async()=>{const r=await worker.fetch(req('writing'),{QUOTAS:mockDB()},ctx(undefined,'wrong'));assert.equal(r.status,403);});
test('rejects a different email',async()=>{const r=await worker.fetch(req('writing'),{QUOTAS:mockDB()},ctx('attacker@example.org'));assert.equal(r.status,403);});
test('writing allows ten, rejects eleventh',async()=>{const env={QUOTAS:mockDB()};for(let i=0;i<10;i++)assert.equal((await worker.fetch(req('writing'),env,ctx())).status,200);const r=await worker.fetch(req('writing'),env,ctx());assert.equal(r.status,429);assert.equal((await r.json()).remaining,0);});
test('speaking allows three, rejects fourth',async()=>{const env={QUOTAS:mockDB()};for(let i=0;i<3;i++)assert.equal((await worker.fetch(req('speaking'),env,ctx())).status,200);assert.equal((await worker.fetch(req('speaking'),env,ctx())).status,429);});
test('rejects missing quota binding',async()=>{assert.equal((await worker.fetch(req('writing'),{},ctx())).status,503);});
test('rejects invalid kind without reservation',async()=>{assert.equal((await worker.fetch(req('invalid'),{QUOTAS:mockDB()},ctx())).status,400);});
