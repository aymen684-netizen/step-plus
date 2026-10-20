// English+ STAGING Worker, not enabled or deployed.
// All paid endpoints deny by default. Set secrets on the Worker, never in GitHub Pages.
// Deployment requires owner auth, quotas and verified OpenAI billing.
const ORIGIN='https://aymen684-netizen.github.io';
const TOPICS={intro:'Introduce yourself and discuss daily routines.',travel:'Practice travel and airport communication.',work:'Discuss work and job interviews.',study:'Discuss school and university life.'};
const LEVELS=['A1','A2','B1','B2','C1'];
const reply=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','vary':'Origin',...(origin===ORIGIN?{'access-control-allow-origin':ORIGIN,'access-control-allow-credentials':'true'}:{})}});
export default {async fetch(request,env){
const url=new URL(request.url),origin=request.headers.get('Origin')||'';
if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin===ORIGIN?ORIGIN:'null','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'Content-Type','access-control-allow-credentials':'true','vary':'Origin'}});
if(url.pathname==='/health')return reply({service:'english-plus-ai-staging',enabled:false},200,origin);
if(origin!==ORIGIN||request.method!=='POST')return reply({error:'forbidden'},403,origin);
if(!['/api/speaking/session','/api/writing/review'].includes(url.pathname))return reply({error:'not_found'},404,origin);
// Config gate deliberately remains shut until security review and manual enablement.
if(env.ENABLE_PRIVATE_AI!=='true')return reply({error:'not_enabled'},503,origin);
// Owner session validation should be enforced by a configured Cloudflare Access JWT
// or an equivalent verified, non-public authentication layer BEFORE enabling this flag.
// Until such validation is implemented, refuse every request regardless of configuration.
return reply({error:'owner_auth_not_implemented'},503,origin);
}};
