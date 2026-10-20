// English+ daily quota helper for Cloudflare D1.
// Bind the private D1 database to env.QUOTAS before enabling any paid requests.
// A single conditional UPSERT ensures concurrent requests do not exceed limits.
// Note: charge is reserved before calling provider; no automatic refund on errors.
export const LIMITS=Object.freeze({writing:10,speaking:3});
export async function reserveDailyUse(db,owner,kind){
 if(!db||!LIMITS[kind]||!owner)throw Error('quota_not_configured');
 const day=new Date().toISOString().slice(0,10);
 const sql=`INSERT INTO usage_daily(day,owner,kind,used) VALUES(?1,?2,?3,1)
 ON CONFLICT(day,owner,kind) DO UPDATE SET used=used+1
 WHERE used < ?4 RETURNING used`;
 const row=await db.prepare(sql).bind(day,owner,kind,LIMITS[kind]).first();
 return {allowed:!!row,remaining:row?LIMITS[kind]-row.used:0,limit:LIMITS[kind]};
}
// Voice sessions are limited to 120,180,300 seconds by the session endpoint.
// Quotas are not monetary caps: configure provider/project budgets separately.
