import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Content safety: not a certification of real Hajj figures.
// Exercise the learner's actual session-selection code in an isolated VM.
const source=readFileSync(new URL('../academy.html',import.meta.url),'utf8');
function data(name){
 const key='const '+name+'=';
 const start=source.indexOf(key);
 assert.ok(start>=0,'missing '+name);
 const end=source.indexOf('];',start+key.length);
 assert.ok(end>start,'unterminated '+name);
 return JSON.parse(source.slice(start+key.length,end+1));
}
const P=data('P'),Q=data('Q'),DIAG=data('DIAG');
const hajj=P.find(p=>p.id==='hajj');
const r2=Q.find(q=>q[0]==='r2');
const declarationStart=source.indexOf('const SUSPENDED_QUESTION_IDS=');
const declarationEnd=source.indexOf('const key=',declarationStart);
const guards=source.slice(declarationStart,declarationEnd);
const beginStart=source.indexOf('function begin(kind,passageId){');
const beginEnd=source.indexOf('function formatTime(',beginStart);
assert.ok(declarationStart>=0&&declarationEnd>declarationStart&&beginStart>=0&&beginEnd>beginStart);

function stateFor({seen=[],mistakes=[]}={}) {
 return {seen,mistakes,results:[],diagnostic:false};
}
function begin(kind,passageId,{seen=[],mistakes=[]}={}){
 const ctx={Q,DIAG,state:stateFor({seen,mistakes}),sess:null,timer:null,
   displayQ:()=>{},alert:()=>{throw Error('unexpected empty pool')},
   setInterval:()=>1,Math};
 const invocation=';begin('+JSON.stringify(kind)+','+JSON.stringify(passageId)+');';
 runInNewContext(guards+source.slice(beginStart,beginEnd)+invocation,ctx,{timeout:3000});
 assert.ok(ctx.sess,'session should exist');
 return Array.from(ctx.sess.ids);
}
function view(name,next,state) {
 const start=source.indexOf('function '+name+'(){');
 const end=source.indexOf('function '+next+'(){',start);
 assert.ok(start>=0&&end>start,'missing '+name+' view');
 const ctx={Q,state,btn:()=>'',esc:x=>String(x),one:id=>Q.find(q=>q[0]===id)};
 runInNewContext(guards+source.slice(start,end)+';globalThis.output='+name+'();',ctx,{timeout:3000});
 return String(ctx.output);
}

test('r2 is an actual chart-versus-answer contradiction, never silently corrected',()=>{
 assert.ok(hajj&&r2,'expected original reference data');
 const years=hajj.chart.labels;
 const outside=hajj.chart.outside;
 assert.equal(years.length,outside.length);
 const observedMax=years[outside.indexOf(Math.max(...outside))];
 assert.equal(observedMax,'2012');
 assert.equal(r2[4][r2[5]],'2010');
 assert.notEqual(observedMax,r2[4][r2[5]],'mismatch must stay reported pending original source');
 assert.match(guards,/SUSPENDED_QUESTION_IDS=new Set\(\['r2'\]\)/);
});

test('reading exercises and Hajj passage exclude the unverified r2 score',()=>{
 const reading=begin('reading'),hajjIds=begin('passage','hajj');
 assert.equal(reading.includes('r2'),false);
 assert.deepEqual(hajjIds,['r1']);
 assert.ok(reading.includes('r1'));
 assert.ok(reading.includes('r3'));
});

test('mixed, mock and review modes cannot assign r2 for grading',()=>{
 for(const mode of ['mixed','mock','review']){
  const ids=begin(mode);
  assert.equal(ids.includes('r2'),false,mode);
  assert.equal(new Set(ids).size,ids.length,mode);
  assert.ok(ids.length>0,mode);
 }
});

test('old wrong-answer queue does not surface suspended r2 again',()=>{
 const ids=begin('mistakes',undefined,{mistakes:['r2','r1']});
 assert.deepEqual(ids,['r1']);
 const html=view('mistakes','resetSeen',stateFor({mistakes:['r2','r1']}));
 assert.doesNotMatch(html,/Which year had the most pilgrims from outside Saudi Arabia/);
 assert.match(html,/عدد الأخطاء الفريدة: 1/);
});

test('diagnostic and grammar modes remain populated and isolated from r2',()=>{
 const diagnostic=begin('diagnostic'),grammar=begin('grammar');
 assert.equal(diagnostic.length,8);
 assert.equal(diagnostic.includes('r2'),false);
 assert.ok(grammar.length>=10);
 assert.equal(grammar.includes('r2'),false);
});

test('already answered r2 is not counted as an active scored exercise',()=>{
 const st=stateFor({seen:['r2','g1']});
 const home=view('home','lessons',st);
 const practice=view('practice','mock',st);
 assert.match(home,/1 \/ 25/);
 assert.match(practice,/المتبقي غير المستخدم: 24 من 25/);
});

test('visible reading description avoids the unsupported 2010 outside-peak claim',()=>{
 assert.doesNotMatch(hajj.body,/largest outside-Saudi segment.*2010/i);
 assert.match(hajj.body,/pending verification/i);
 assert.match(source,/سؤال الحجاج المتعارض موقوف عن التصحيح/);
});
