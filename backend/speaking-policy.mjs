/**
 * English+ speaking admission helpers. Pure policy + atomic D1 allowance.
 * Intentionally contains NO OpenAI call, no credential minting, and no session
 * lifecycle API. It is not a ready-to-deploy speaking endpoint.
 */
const TOPICS = new Set(['intro', 'travel', 'work', 'study']);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const DURATIONS = new Set([120, 180, 300]);
const QUOTA_SQL = `INSERT INTO usage_daily (day, owner, kind, used)
VALUES (?, ?, 'speaking', 1)
ON CONFLICT(day, owner, kind) DO UPDATE SET
  used = usage_daily.used + 1
WHERE usage_daily.used < CAST(? AS INTEGER)
RETURNING used`;

export function validateSpeakingOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const {topic,level,seconds}=value;
  if (!TOPICS.has(topic) || !LEVELS.has(level) || !DURATIONS.has(seconds)) return null;
  return {topic,level,seconds};
}

export function riyadhDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function reserveSpeakingQuota(db, {now = new Date(), ownerKey = 'single-owner'} = {}) {
  if (!db?.prepare || ownerKey !== 'single-owner')
    return {ok:false,status:503,error:'quota_unavailable'};
  try {
    const row=await db.prepare(QUOTA_SQL).bind(riyadhDay(now),ownerKey,3).first();
    if (row===null) return {ok:false,status:429,error:'speaking_limit_reached'};
    if (!Number.isInteger(row?.used) || row.used<1 || row.used>3)
      return {ok:false,status:503,error:'quota_unavailable'};
    return {ok:true,remaining:3-row.used};
  } catch {
    return {ok:false,status:503,error:'quota_unavailable'};
  }
}
