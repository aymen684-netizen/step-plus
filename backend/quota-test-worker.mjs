// English+ quota-only test Worker. NO OpenAI calls.
// Deploy to english-plus-ai-staging only, with D1 binding QUOTAS.
// Cloudflare Access must protect this exact Worker/hostname.
const OWNER='aymen684@gmail.com';
const AUD='ae04af66e40b398431006c55c4d2c282b6decf81afffc6f93d1a5ffbddca8d80';
const LIMITS={writing:10,speaking:3};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers})}
export default {async fetch(request,env,ctx){
 if(!ctx.access||ctx.access.aud!==AUD)return json({error:'access_required'},403);
 let identity;
 try{identity=await ctx.access.getIdentity()}catch{return json({error:'identity_unavailable'},403)}
 const owner=identity?.email?.toLowerCase();
 if(owner!==OWNER)return json({error:'owner_only'},403);
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/status'&&request.method==='GET')
  return json({authenticated:true,paidAiEnabled:false,quotaConfigured:!!env.QUOTAS});
 if(path!=='/api/quota/test'||request.method!=='POST')return json({error:'not_found'},404);
 if(!env.QUOTAS)return json({error:'quota_not_configured'},503);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
  return json({error:'content_type_required'},415);
 let data;
 try{if(Number(request.headers.get('content-length')||0)>256)return json({error:'too_large'},413);
  const raw=await request.text();if(raw.length>256)return json({error:'too_large'},413);data=JSON.parse(raw)}
 catch{return json({error:'invalid_json'},400)}
 if(!Object.hasOwn(LIMITS,data?.kind))return json({error:'invalid_kind'},400);
 const kind=data.kind,limit=LIMITS[kind],day=new Date().toISOString().slice(0,10);
 const sql=`INSERT INTO usage_daily(day,owner,kind,used) VALUES(?1,?2,?3,1)
 ON CONFLICT(day,owner,kind) DO UPDATE SET used=used+1
 WHERE used < ?4 RETURNING used`;
 try{
  const result=await env.QUOTAS.prepare(sql).bind(day,owner,kind,limit).first();
  if(!result)return json({kind,allowed:false,remaining:0,limit,paidAiEnabled:false},429);
  return json({kind,allowed:true,remaining:limit-result.used,limit,paidAiEnabled:false});
 }catch{return json({error:'quota_database_failed'},503)}
}};
