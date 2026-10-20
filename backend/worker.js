// English+ AI backend skeleton. NO audio/transcript persistence.
// Protected AI routes deliberately disabled until production auth, billing, abuse limits and provider retention are reviewed.
const ORIGIN = "https://aymen684-netizen.github.io";
const json=(data,status=200,origin="")=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin",...(origin===ORIGIN?{"access-control-allow-origin":ORIGIN}:{})}});
export default {async fetch(request,env){
 const origin=request.headers.get("origin")||"";
 const url=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin===ORIGIN?ORIGIN:"null","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"Content-Type, Authorization","access-control-max-age":"300","vary":"Origin"}});
 if(url.pathname==="/health"&&request.method==="GET")return json({service:"english-plus-ai",status:"setup-required",writingAi:false,speakingAi:false,audioStorage:false,notice:"AI endpoints are not activated."},200,origin);
 if(url.pathname.startsWith("/api/"))return json({error:"not_enabled",message:"AI services are not yet available. Backend requires identity verification, authenticated quotas, API key, safety review and data retention approval."},503,origin);
 return json({error:"not_found"},404,origin);
}};
