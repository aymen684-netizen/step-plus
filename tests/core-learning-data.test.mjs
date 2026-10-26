import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// No external dependencies or HTTP. This suite exercises actual public-page
// source and pure score logic using synthetic answers in an isolated VM.
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const homepage=source('index.html');
const academy=source('academy.html');
const reading=source('reading-tests.html');

function jsonLiteral(html,prefix,ending='];'){
 const start=html.indexOf(prefix);
 assert.notEqual(start,-1,'required data source: '+prefix);
 const stop=html.indexOf(ending,start+prefix.length);
 assert.notEqual(stop,-1,'required data terminator: '+prefix);
 return JSON.parse(html.slice(start+prefix.length,stop+ending.length-1));
}
const generalQ=jsonLiteral(homepage,'const Q=');
const academyQ=jsonLiteral(academy,'const Q=');
const diagnostic=jsonLiteral(academy,'const DIAG=');
const readingQ=jsonLiteral(reading,'const questions=');

function placementIds(){
 const m=homepage.match(/if\(type==='placement'\)\{ids=\[([\d,]+)\]\}/);
 assert.ok(m,'ten-question placement list exists');
 return m[1].split(',').map(Number);
}
function simulateGeneral(answers){
 const start=homepage.indexOf('function finish(){');
 const stop=homepage.indexOf('function reset(){',start);
 assert.ok(start>=0&&stop>start,'actual general score function extracted');
 const displayed={innerHTML:''};
 const state={seen:[],results:[],placement:null,errors:[]};
 const current={type:'placement',ids:placementIds(),idx:0,answers};
 const ctx={Q:generalQ,current,state,save:()=>{},$:()=>displayed,Date};
 runInNewContext(homepage.slice(start,stop)+'; finish();',ctx,{timeout:3000});
 return {state,html:displayed.innerHTML,current:ctx.current};
}
function simulateAcademy(answers,kind='diagnostic'){
 const start=academy.indexOf('function finish(){');
 const stop=academy.indexOf("}page('home');</script>",start);
 assert.ok(start>=0&&stop>start,'actual STEP session finish function extracted');
 const view={innerHTML:''};
 const state={seen:[],mistakes:[],results:[],diagnostic:false};
 const sess={kind,ids:Object.keys(answers),idx:0,answers,seconds:null};
 const ctx={sess,state,timer:null,save:()=>{},one:id=>academyQ.find(q=>q[0]===id),
  document:{getElementById:()=>view},btn:()=>'',clearInterval:()=>{},Date};
 runInNewContext(academy.slice(start,stop+1)+'; finish();',ctx,{timeout:3000});
 return {state,html:view.innerHTML,sess:ctx.sess};
}

test('general question bank has unique valid keys, four options and CEFR-style levels',()=>{
 assert.ok(generalQ.length>=20);
 for(const [i,q] of generalQ.entries()){
  assert.ok(['grammar','reading','vocabulary'].includes(q[0]),'kind '+i);
  assert.ok(['A1','A2','B1','B2','C1'].includes(q[1]),'level '+i);
  assert.equal(q[3].length,4,'four options '+i);
  assert.ok(Number.isInteger(q[4])&&q[4]>=0&&q[4]<4,'answer '+i);
  assert.equal(typeof q[5],'string');
 }
});
test('English+ placement uses ten unique in-range questions with all five levels',()=>{
 const ids=placementIds();
 assert.equal(ids.length,10);
 assert.equal(new Set(ids).size,10);
 const counts={};
 for(const i of ids){
  assert.ok(i>=0&&i<generalQ.length);
  const level=generalQ[i][1];counts[level]=(counts[level]||0)+1;
 }
 for(const level of ['A1','A2','B1','B2','C1'])assert.equal(counts[level],2);
});
test('actual placement finish() grants 100% and indicative C1, without consuming training questions',()=>{
 const answers=Object.fromEntries(placementIds().map(i=>[i,generalQ[i][4]]));
 const {state,html,current}=simulateGeneral(answers);
 assert.equal(state.placement.level,'C1');
 assert.equal(state.placement.score,100);
 assert.equal(state.results.at(-1).correct,10);
 assert.equal(state.results.at(-1).total,10);
 assert.deepEqual(state.seen,[]);
 assert.match(html,/10 من 10/);
 assert.match(html,/مؤشر أولي وليس شهادة مستوى/);
 assert.equal(current,null);
});
test('actual placement finish() grants 0% and indicative A1 on all wrong answers',()=>{
 const answers=Object.fromEntries(placementIds().map(i=>[i,(generalQ[i][4]+1)%4]));
 const {state,html}=simulateGeneral(answers);
 assert.equal(state.placement.level,'A1');
 assert.equal(state.placement.score,0);
 assert.match(html,/0 من 10/);
});
test('academy has valid unique questions and eight non-duplicated diagnostic IDs',()=>{
 assert.ok(academyQ.length>=20);
 const known=new Map(academyQ.map(q=>[q[0],q]));
 assert.equal(known.size,academyQ.length);
 assert.equal(diagnostic.length,8);
 assert.equal(new Set(diagnostic).size,8);
 for(const id of diagnostic){
  const q=known.get(id);
  assert.ok(q,'known diagnostic id '+id);
  assert.equal(q[4].length,4);
  assert.ok(q[5]>=0&&q[5]<4);
 }
});
test('actual STEP finish() completes diagnostic with grammar and reading score breakdown',()=>{
 const answers=Object.fromEntries(diagnostic.map(id=>[id,academyQ.find(q=>q[0]===id)[5]]));
 const {state,html,sess}=simulateAcademy(answers);
 assert.equal(state.diagnostic,true);
 assert.deepEqual(state.seen,[]);
 assert.equal(state.results.at(-1).correct,8);
 assert.equal(state.results.at(-1).total,8);
 assert.match(html,/نتيجة الجلسة/);
 assert.match(html,/8 \/ 8/);
 assert.match(html,/القواعد/);
 assert.match(html,/القراءة/);
 assert.equal(sess,null,'session freed only after scores are computed');
});
test('actual STEP mock finish() counts attempted questions and can render incorrect answers',()=>{
 const q=academyQ[0];
 const {state,html,sess}=simulateAcademy({[q[0]]:(q[5]+1)%q[4].length},'mock');
 assert.equal(state.results.at(-1).kind,'mock');
 assert.equal(state.results.at(-1).correct,0);
 assert.equal(state.results.at(-1).total,1);
 assert.match(html,/نتيجة الجلسة/);
 assert.match(html,/0 \/ 1/);
 assert.equal(sess,null);
});
test('STEP reading IDs and option/answer shapes are internally coherent',()=>{
 assert.ok(readingQ.length>=59);
 assert.equal(new Set(readingQ.map(q=>q.id)).size,readingQ.length);
 for(const q of readingQ){
  assert.ok(q.title&&q.question&&q.id);
  assert.ok(Array.isArray(q.options)&&q.options.length>=2);
  assert.ok([4,5].includes(q.stars));
  assert.ok(q.p>0);
 }
});
test('STEP reading unreviewed items are not assigned a scored answer',()=>{
 const pending=readingQ.filter(q=>q.reviewStatus!=='text-supported');
 assert.ok(pending.length>0,'pending questions must be tracked');
 for(const q of pending)assert.equal(q.reviewAnswer,null,q.id);
 assert.match(reading,/q\.reviewStatus==='text-supported'/);
 assert.match(reading,/let verified=attempted\.filter\(q=>q\.reviewStatus==='text-supported'\)/);
});
test('all counted STEP reading questions have evidence and valid review index',()=>{
 const approved=readingQ.filter(q=>q.reviewStatus==='text-supported');
 assert.ok(approved.length>0);
 for(const q of approved){
  assert.ok(Number.isInteger(q.reviewAnswer),q.id);
  assert.ok(q.reviewAnswer>=0&&q.reviewAnswer<q.options.length,q.id);
  assert.ok(q.evidence.trim().length>0,q.id);
 }
});
for(const [name,html] of [['English+ home',homepage],['STEP academy',academy],['STEP reading',reading]]){
 test(name+' has Arabic page semantics and mobile viewport declaration',()=>{
  assert.match(html,/<html\s+lang="ar"\s+dir="rtl">/i);
  assert.match(html,/<meta\s+name="viewport"/i);
  assert.match(html,/<main\b/i);
  assert.match(html,/<h1\b/i);
 });
}
