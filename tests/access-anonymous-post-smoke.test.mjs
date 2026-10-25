import test from 'node:test';
import assert from 'node:assert/strict';
import {POST_PROBES,probeAnonymousPost} from './access-anonymous-post-smoke.mjs';

const LOGIN='https://lingering-bread-cdac.cloudflareaccess.com/cdn-cgi/access/login/example';
const reply=(status=302,location=LOGIN)=>new Response(null,{status,headers:{Location:location}});

test('only four known sensitive Worker POST routes, no query params',()=>{
  assert.equal(POST_PROBES.length,4);
  assert.equal(new Set(POST_PROBES.map(p=>p.id)).size,4);
  const expected=new Set([
    'english-plus-ai.aymen684.workers.dev/api/admin/self-test',
    'english-plus-ai.aymen684.workers.dev/api/writing/review',
    'english-plus-ai-staging.aymen684.workers.dev/api/writing/review',
    'english-plus-ai-staging.aymen684.workers.dev/api/quota/test'
  ]);
  for(const p of POST_PROBES){
    const u=new URL(p.url);
    assert.equal(u.protocol,'https:');
    assert.ok(expected.has(u.host+u.pathname));
    assert.equal(u.search,'');
    assert.equal(u.hash,'');
    expected.delete(u.host+u.pathname);
  }
  assert.equal(expected.size,0);
});

test('test POST requests cannot contain body, Origin, cookie or authorization',async()=>{
  let calls=0;
  for(const probe of POST_PROBES){
    const result=await probeAnonymousPost(probe,{fetchImpl:async (url,opts)=>{
      calls++;
      assert.equal(url,probe.url);
      assert.equal(opts.method,'POST');
      assert.equal(opts.redirect,'manual');
      assert.equal(opts.credentials,'omit');
      assert.deepEqual(opts.headers,{Accept:'application/json'});
      assert.equal(opts.body,undefined);
      assert.equal(opts.headers.Origin,undefined);
      assert.equal(opts.headers.Authorization,undefined);
      assert.equal(opts.headers.Cookie,undefined);
      assert.equal(opts.headers['Content-Type'],undefined);
      return reply();
    }});
    assert.equal(result.accepted,true);
    assert.equal(result.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
  }
  assert.equal(calls,4);
});

test('a 2xx from an anonymous POST is a security failure',async()=>{
  const r=await probeAnonymousPost(POST_PROBES[1],{fetchImpl:async()=>new Response('sent',{status:200})});
  assert.equal(r.accepted,false);
  assert.equal(r.outcome,'UNAUTHENTICATED_2XX_SECURITY_FAILURE');
});

test('application layer denial is not misattributed to Access',async()=>{
  const r=await probeAnonymousPost(POST_PROBES[0],{fetchImpl:async()=>new Response(null,{status:403})});
  assert.equal(r.accepted,false);
  assert.equal(r.outcome,'HTTP_DENIED_NOT_ACCESS_ATTRIBUTED');
});

test('unrelated redirects, DNS failure and 5xx are not successful Access challenges',async()=>{
  const checks=[
    async()=>reply(302,'https://other.example/signin'),
    async()=>new Response(null,{status:503}),
    async()=>{const e=new Error('redacted');e.cause={code:'ENOTFOUND'};throw e;}
  ];
  for(const fake of checks){
    const r=await probeAnonymousPost(POST_PROBES[0],{fetchImpl:fake});
    assert.equal(r.accepted,false);
    assert.notEqual(r.outcome,'CLOUDFLARE_ACCESS_CHALLENGE');
    assert.equal(JSON.stringify(r).includes('redacted'),false);
  }
});

test('cannot probe an unapproved hostname or method-specific path',async()=>{
  await assert.rejects(()=>probeAnonymousPost({
    id:'not-allowed',url:'https://example.invalid/another-route'
  }),/POST_PROBE_NOT_ALLOWLISTED/);
});

test('only the exact Cloudflare Access organization is accepted',async()=>{
  const r=await probeAnonymousPost(POST_PROBES[0],{fetchImpl:async()=>reply(
    302,'https://unrelated.cloudflareaccess.com/cdn-cgi/access/login'
  )});
  assert.equal(r.accepted,false);
  assert.equal(r.outcome,'UNRELATED_REDIRECT');
});
