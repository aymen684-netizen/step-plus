// English+ anonymous POST perimeter smoke (no body, Origin, cookies or auth).
// This verifies Cloudflare Access intercepts sensitive POST paths before Worker code.
// It must never send user drafts, OpenAI calls, credentials or paid requests.
import {classifyUnauthenticated} from './access-live-smoke.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const POST_PROBES=Object.freeze([
  {id:'production-admin-post',url:'https://english-plus-ai.aymen684.workers.dev/api/admin/self-test'},
  {id:'production-writing-post',url:'https://english-plus-ai.aymen684.workers.dev/api/writing/review'},
  {id:'staging-writing-post',url:'https://english-plus-ai-staging.aymen684.workers.dev/api/writing/review'},
  {id:'staging-quota-post',url:'https://english-plus-ai-staging.aymen684.workers.dev/api/quota/test'}
]);

const ALLOWED=new Set(POST_PROBES.map(p=>p.url));

export async function probeAnonymousPost(probe,{fetchImpl=fetch}={}){
  // Fail closed if a test tries to add any arbitrary URL, credentials or body.
  if(!probe||!ALLOWED.has(probe.url)) throw new Error('POST_PROBE_NOT_ALLOWLISTED');
  const options={
    method:'POST',
    redirect:'manual',
    credentials:'omit',
    headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(12000)
    // Deliberately no body, Content-Type, Origin, Authorization or Cookie.
  };
  try {
    const res=await fetchImpl(probe.url,options);
    const evaluation=classifyUnauthenticated({
      status:res.status,
      location:res.headers.get('location'),
      requestUrl:probe.url
    });
    // No body reading; no redirect query, cookies, IP, identity or token logging.
    return {id:probe.id,http_status:res.status,...evaluation};
  } catch(e) {
    return {id:probe.id,http_status:null,accepted:false,
      outcome:'NETWORK_INCONCLUSIVE',error_code:String(e?.cause?.code||e?.name||'NETWORK_ERROR').slice(0,64)};
  }
}

export async function run(){
  const results=await Promise.all(POST_PROBES.map(p=>probeAnonymousPost(p)));
  for(const item of results) console.log(JSON.stringify(item));
  const verified=results.filter(x=>x.outcome==='CLOUDFLARE_ACCESS_CHALLENGE'&&x.accepted).length;
  console.log('ANONYMOUS_POST_ACCESS_CHALLENGES='+verified+'/'+results.length);
  if(verified!==results.length)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
