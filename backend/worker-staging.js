// English+ staged API. Authentication proof via Cloudflare ctx.access.
// Paid AI deliberately disabled pending quota and billing controls.
const OWNER='aymen684@gmail.com';
const ACCESS_AUD='0dbb2f48add6b4973115ffb89fb3c1e98aa7bdc5726c13272211fbdb1b3d6a1f';
const ALLOWED_ORIGIN='https://aymen684-netizen.github.io';
const respond=(data,status=200,origin='')=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
 ...(origin===ALLOWED_ORIGIN?{'Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Credentials':'true'}:{})}
});
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),origin=request.headers.get('Origin')||'';
  if(request.method==='OPTIONS'){
   if(origin!==ALLOWED_ORIGIN)return new Response(null,{status:403});
   return new Response(null,{status:204,headers:{
     'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
     'Access-Control-Allow-Credentials':'true',
     'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
     'Access-Control-Allow-Headers':'Content-Type',
     'Access-Control-Max-Age':'600','Vary':'Origin'}});
  }
  // Access can be bypassed on alternative routes if configured incorrectly.
  // Fail closed unless the current direct request was authenticated by Access.
  if(!ctx.access || ctx.access.aud!==ACCESS_AUD)return respond({error:'access_required'},403,origin);
  let identity;
  try{identity=await ctx.access.getIdentity()}catch{return respond({error:'identity_unavailable'},403,origin)}
  if(identity?.email?.toLowerCase()!==OWNER)return respond({error:'owner_only'},403,origin);
  if(url.pathname==='/api/auth/status'&&request.method==='GET')
   return respond({authenticated:true,owner:true,paidAiEnabled:false},200,origin);
  if(url.pathname==='/health'&&request.method==='GET')
   return respond({service:'english-plus-ai-staging',authentication:'required',paidAiEnabled:false},200,origin);
  if(['/api/speaking/session','/api/writing/review'].includes(url.pathname)&&request.method==='POST')
   return respond({error:'ai_disabled_pending_usage_limits'},503,origin);
  return respond({error:'not_found'},404,origin);
 }
};
