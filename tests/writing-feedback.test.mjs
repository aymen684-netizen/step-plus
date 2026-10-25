import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Tests the actual legacy production Worker with a fully mocked provider.
// No real secrets, network calls, or Cloudflare deployment are involved.
const workerSource=readFileSync(new URL('../backend/worker.js',import.meta.url),'utf8');
const ORIGIN='https://aymen684-netizen.github.io';
const TOKEN='synthetic-ci-token-no-secret';
const DRAFT='I enjoy studying English because practice helps me communicate clearly every day.';
const VALID_FEEDBACK={
 summary:'Your paragraph has a clear main idea.',
 strengths:['Clear intent','Relevant vocabulary'],
 corrections:[{original:'I has time',suggestion:'I have time',reason:'Subject-verb agreement'}],
 nextTask:'Revise the sentence using have.',
 taskCompletion:80,grammar:75,coherence:85,vocabulary:70
};
const providerResponse=(fb)=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fb)}]}]}),{status:200,headers:{'content-type':'application/json'}});
function makeHarness(provider){
 const handlers=[],calls=[];
 const scope={
  URL,Response,AbortSignal,
  ADMIN_TEST_TOKEN:TOKEN,
  OPENAI_API_KEY:'synthetic-ci-key-not-a-secret',
  ENABLE_WRITING_AI:'true',
  ENABLE_ADMIN_SELF_TEST:'false',
  addEventListener:(type,handler)=>{if(type==='fetch')handlers.push(handler)},
  fetch:async (url,init)=>{calls.push({url,init});return await provider(url,init)}
 };
 runInNewContext(workerSource,scope,{timeout:1000,filename:'backend/worker.js'});
 assert.equal(handlers.length,1);
 async function review(draft=DRAFT){
  const request=new Request('https://englishplus.test/api/writing/review',{
   method:'POST',headers:{Origin:ORIGIN,Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({draft,stage:'paragraph',level:'B1'})
  });
  let promise;
  handlers[0]({request,respondWith:p=>{promise=Promise.resolve(p)}});
  assert.ok(promise,'Worker must respond');
  return await promise;
 }
 return {review,calls};
}
const harnessFor=fb=>makeHarness(async()=>providerResponse(fb));
const patched=changes=>({...VALID_FEEDBACK,...changes});

test('valid feedback is returned in a bounded, structured envelope',async()=>{
 const x=harnessFor(VALID_FEEDBACK);
 const r=await x.review();
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.feedback.summary,VALID_FEEDBACK.summary);
 assert.equal(data.feedback.scores.grammar,75);
 assert.equal(data.feedback.corrections[0].suggestion,'I have time');
 assert.equal(x.calls.length,1);
 const sent=JSON.parse(x.calls[0].init.body);
 assert.equal(sent.store,false,'provider storage must be disabled for request');
 assert.equal(JSON.parse(sent.input).draft,DRAFT);
});

test('provider score greater than 100 is rejected',async()=>{
 const x=harnessFor(patched({grammar:150}));
 const r=await x.review();assert.equal(r.status,502);
 assert.equal((await r.json()).error,'invalid_feedback');
});

test('negative or fractional rubric scores are rejected',async()=>{
 for(const scores of [{coherence:-1},{vocabulary:82.5}]){
  const x=harnessFor(patched(scores));const r=await x.review();
  assert.equal(r.status,502);assert.equal((await r.json()).error,'invalid_feedback');
 }
});

test('rubric scores must be numbers, not strings or absent',async()=>{
 for(const scores of [{taskCompletion:'90'},{grammar:undefined}]){
  const x=harnessFor(patched(scores));const r=await x.review();
  assert.equal(r.status,502);assert.equal((await r.json()).error,'invalid_feedback');
 }
});

test('malformed correction objects are rejected',async()=>{
 for(const corrections of [[null],[{original:'was',suggestion:123,reason:'grammar'}],[{original:'was',suggestion:'were'}]]){
  const x=harnessFor(patched({corrections}));const r=await x.review();
  assert.equal(r.status,502);assert.equal((await r.json()).error,'invalid_feedback');
 }
});

test('strengths must be an array of strings with bounded items',async()=>{
 for(const strengths of ['not-an-array',[{text:'unexpected object'}],['fine','good','clear','too many']]){
  const x=harnessFor(patched({strengths}));const r=await x.review();
  assert.equal(r.status,502);assert.equal((await r.json()).error,'invalid_feedback');
 }
});

test('summary and next task must be nonempty strings',async()=>{
 for(const changes of [{summary:''},{summary:null},{nextTask:{}},{nextTask:''}]){
  const x=harnessFor(patched(changes));const r=await x.review();
  assert.equal(r.status,502);assert.equal((await r.json()).error,'invalid_feedback');
 }
});

test('provider HTTP failures do not expose the upstream response body',async()=>{
 const x=makeHarness(async()=>new Response('private upstream diagnostic',{status:429}));
 const r=await x.review();const result=await r.json();
 assert.equal(r.status,502);assert.equal(result.error,'provider_failure');
 assert.equal(JSON.stringify(result).includes('private upstream diagnostic'),false);
});

test('malformed provider output JSON is handled safely',async()=>{
 const x=makeHarness(async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{not valid json'}]}]}),{status:200}));
 const r=await x.review();assert.equal(r.status,502);
 assert.equal((await r.json()).error,'unparseable_feedback');
});

test('provider response that is not valid JSON is handled safely',async()=>{
 const x=makeHarness(async()=>new Response('this is not JSON',{status:200}));
 const r=await x.review();assert.equal(r.status,502);
 assert.equal((await r.json()).error,'invalid_provider_response');
});

test('unexpected provider output containers are rejected, not thrown',async()=>{
 for(const output of [{unexpected:'object'},[null],[{content:null}]]){
  const x=makeHarness(async()=>new Response(JSON.stringify({output}),{status:200}));
  const r=await x.review();
  assert.equal(r.status,502);
  assert.equal((await r.json()).error,'invalid_provider_response');
 }
});

test('malformed output items cannot corrupt an otherwise valid rubric',async()=>{
 const output=[{content:[null,{type:'output_text',text:JSON.stringify(VALID_FEEDBACK)}]}];
 const x=makeHarness(async()=>new Response(JSON.stringify({output}),{status:200}));
 const r=await x.review();
 assert.equal(r.status,200);
 assert.equal((await r.json()).feedback.scores.coherence,85);
});
