// English+ private writing preflight — DRY RUN ONLY (no OpenAI calls).
// This is a separate staging-only candidate, NOT the current deployed Worker.
// Environment required: STAGING_DRY_RUN_ENABLED=true, STAGING_ACCESS_AUD,
// STAGING_OWNER_EMAIL, QUOTAS (D1). All missing configuration fails closed.
import { reserveDailyUse } from './daily-quotas.js';

const TRUSTED_ORIGIN='https://aymen684-netizen.github.io';
const MAX_BODY_BYTES=12000;
const MAX_DRAFT_LENGTH=6000;
const PATH='/api/writing/preflight';
const STAGES=new Set(['sentence','paragraph','comparison','opinion']);
const LEVELS=new Set(['A1','A2','B1','B2','C1']);

function respond(body,status=200,origin=''){
 const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'vary':'Origin'
 };
 if(origin===TRUSTED_ORIGIN){
  headers['access-control-allow-origin']=TRUSTED_ORIGIN;
  headers['access-control-allow-credentials']='true';
 }
 return new Response(JSON.stringify(body),{status,headers});
}

async function readBoundedJSON(request){
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return {status:415,error:'content_type_required'};
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY_BYTES))
  return {status:413,error:'too_large'};
 if(!request.body)return {status:400,error:'invalid_json'};
 const reader=request.body.getReader();
 let bytes=0;
 const chunks=[];
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>MAX_BODY_BYTES){
    await reader.cancel();
    return {status:413,error:'too_large'};
   }
   chunks.push(value);
  }
  const merged=new Uint8Array(bytes);
  let cursor=0;
  for(const chunk of chunks){merged.set(chunk,cursor);cursor+=chunk.byteLength;}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(merged));
  if(!data||typeof data!=='object'||Array.isArray(data))return {status:400,error:'invalid_json'};
  return {data};
 }catch{
  try{await reader.cancel()}catch{}
  return {status:400,error:'invalid_json'};
 }
}

const validSetup=env=>
 env?.STAGING_DRY_RUN_ENABLED==='true'&&
 typeof env.STAGING_ACCESS_AUD==='string'&&/^[a-f0-9]{64}$/i.test(env.STAGING_ACCESS_AUD)&&
 typeof env.STAGING_OWNER_EMAIL==='string'&&
 /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.STAGING_OWNER_EMAIL)&&
 Boolean(env.QUOTAS&&typeof env.QUOTAS.prepare==='function');

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const origin=request.headers.get('Origin')||'';
  if(request.method==='OPTIONS'&&url.pathname===PATH){
   if(origin!==TRUSTED_ORIGIN)return respond({error:'origin_not_allowed'},403);
   return new Response(null,{status:204,headers:{
    'access-control-allow-origin':TRUSTED_ORIGIN,
    'access-control-allow-credentials':'true',
    'access-control-allow-methods':'POST,OPTIONS',
    'access-control-allow-headers':'Content-Type',
    'access-control-max-age':'300',
    'cache-control':'no-store',
    'vary':'Origin'
   }});
  }
  if(url.pathname!==PATH||request.method!=='POST')return respond({error:'not_found'},404,origin);
  if(origin!==TRUSTED_ORIGIN)return respond({error:'origin_not_allowed'},403);
  if(!validSetup(env))return respond({error:'not_enabled'},503,origin);
  if(!ctx?.access||ctx.access.aud!==env.STAGING_ACCESS_AUD)
   return respond({error:'access_required'},403,origin);
  let identity;
  try{identity=await ctx.access.getIdentity()}catch{return respond({error:'access_required'},403,origin);}
  const email=typeof identity?.email==='string'?identity.email.toLowerCase().trim():'';
  const ownerId=identity?.user_uuid;
  if(email!==env.STAGING_OWNER_EMAIL.trim().toLowerCase()||
     typeof ownerId!=='string'||!(/^[a-z0-9-]{8,128}$/i.test(ownerId)))
   return respond({error:'access_required'},403,origin);
  const parsed=await readBoundedJSON(request);
  if(parsed.error)return respond({error:parsed.error},parsed.status,origin);
  const {draft,stage,level}=parsed.data;
  if(typeof draft!=='string'||draft.trim().length<30||draft.length>MAX_DRAFT_LENGTH||
     !STAGES.has(stage)||!LEVELS.has(level))
   return respond({error:'invalid_input'},400,origin);

  // Reserve exactly one D1 quota atomically. Only an opaque Access UUID is stored;
  // never write draft, email, transcript or feedback to D1.
  let reserved;
  try{reserved=await reserveDailyUse(env.QUOTAS,ownerId,'writing')}
  catch{return respond({error:'quota_unavailable'},503,origin)}
  if(!reserved.allowed)return respond({
   error:'daily_quota_exhausted',remaining:0,limit:reserved.limit,paidAiEnabled:false
  },429,origin);
  // No model/API request, no draft/identity echo and no user content in logs.
  return respond({
   accepted:true,dryRun:true,paidAiEnabled:false,validated:{stage,level},
   quota:{remaining:reserved.remaining,limit:reserved.limit},
   message:'Private staging preflight only. No AI assessment performed.'
  },200,origin);
 }
};
