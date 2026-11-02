import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSpeakingOptions,riyadhDay,reserveSpeakingQuota} from '../backend/speaking-policy.mjs';
function db(){const count=new Map();return {count,prepare(sql){assert.match(sql,/RETURNING used/);return {bind(day,owner,limit){return {async first(){const key=day+'|'+owner;const next=(count.get(key)||0)+1;if(next>limit)return null;count.set(key,next);return {used:next};}}}}}};}
test('strictly permits 2, 3, and 5 minute sessions',()=>{
 for(const seconds of [120,180,300])assert.deepEqual(validateSpeakingOptions({topic:'travel',level:'B1',seconds}),{topic:'travel',level:'B1',seconds});
});
test('invalid topics levels and durations fail closed',()=>{
 for(const v of [null,[],{}, {topic:'other',level:'B1',seconds:120},{topic:'work',level:'C2',seconds:120},{topic:'work',level:'B1',seconds:301},{topic:'work',level:'B1',seconds:'120'}])assert.equal(validateSpeakingOptions(v),null);
});
test('Riyadh day rotates at UTC 21:00',()=>{
 assert.equal(riyadhDay(new Date('2026-11-02T20:59:59Z')),'2026-11-02');
 assert.equal(riyadhDay(new Date('2026-11-02T21:00:00Z')),'2026-11-03');
});
test('3 speaking reservations accepted, fourth rejected',async()=>{
 const store=db();for(let i=2;i>=0;i--)assert.deepEqual(await reserveSpeakingQuota(store),{ok:true,remaining:i});
 assert.deepEqual(await reserveSpeakingQuota(store),{ok:false,status:429,error:'speaking_limit_reached'});
});
test('20 concurrent mock reservations accept 3 only',async()=>{
 const store=db(),results=await Promise.all(Array.from({length:20},()=>reserveSpeakingQuota(store)));
 assert.equal(results.filter(x=>x.ok).length,3);assert.equal(results.filter(x=>x.status===429).length,17);
});
test('new Riyadh day gets a fresh quota',async()=>{
 const store=db();for(let i=0;i<3;i++)await reserveSpeakingQuota(store,{now:new Date('2026-11-02T20:59:59Z')});
 assert.deepEqual(await reserveSpeakingQuota(store,{now:new Date('2026-11-02T21:00:00Z')}),{ok:true,remaining:2});
});
test('missing database and nonfixed owner fail closed',async()=>{
 assert.equal((await reserveSpeakingQuota(null)).status,503);
 assert.equal((await reserveSpeakingQuota(db(),{ownerKey:'email@example.org'})).status,503);
});
