import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the real STEP academy finish() implementation with synthetic data.
// All execution is local in a Node VM: no external calls, learner data, or DOM.
const src=readFileSync(new URL('../academy.html',import.meta.url),'utf8');
function sourceArray(name){
 const start=src.indexOf('const '+name+'=');
 assert.ok(start>=0,'missing '+name);
 const from=start+('const '+name+'=').length;
 const end=src.indexOf('];',from);
 assert.ok(end>from,'unterminated '+name);
 return JSON.parse(src.slice(from,end+1));
}
const bank=sourceArray('Q');
const diagnostic=sourceArray('DIAG');
const known=new Map(bank.map(q=>[q[0],q]));

function complete({answers,kind='diagnostic',timer=null}){
 const start=src.indexOf('function finish(){');
 const stop=src.indexOf("}page('home');</script>",start);
 assert.ok(start>=0&&stop>start,'actual finish() can be extracted');
 const view={innerHTML:''};
 const state={seen:[],mistakes:[],results:[],diagnostic:false};
 const cleared=[];
 const ctx={state,sess:{kind,ids:Object.keys(answers),answers,idx:0,seconds:null},timer,
  save:()=>{},Date,one:id=>known.get(id),btn:()=>'',clearInterval:x=>cleared.push(x),
  document:{getElementById:()=>view}};
 runInNewContext(src.slice(start,stop+1)+'; finish();',ctx,{timeout:3000});
 return {state,html:view.innerHTML,session:ctx.sess,cleared};
}

test('the eight diagnostic IDs exist, are unique and have valid answer indices',()=>{
 assert.equal(diagnostic.length,8);
 assert.equal(new Set(diagnostic).size,8);
 for(const id of diagnostic){
  const q=known.get(id);
  assert.ok(q,id);
  assert.equal(q[4].length,4);
  assert.ok(Number.isInteger(q[5])&&q[5]>=0&&q[5]<4);
 }
});

test('full-correct diagnostic finishes and shows overall/grammar/reading scores',()=>{
 const answers=Object.fromEntries(diagnostic.map(id=>[id,known.get(id)[5]]));
 const out=complete({answers});
 assert.equal(out.state.diagnostic,true);
 assert.equal(out.state.results.at(-1).correct,8);
 assert.equal(out.state.results.at(-1).total,8);
 assert.deepEqual(out.state.seen,[],'diagnostic must not use training bank');
 assert.match(out.html,/نتيجة الجلسة/);
 assert.match(out.html,/8 \/ 8/);
 assert.match(out.html,/4\/4/);
 assert.match(out.html,/ليست درجة STEP الرسمية/);
 assert.equal(out.session,null,'cleanup occurs after rendering');
});

test('mock with one wrong answer finishes and grades attempted questions only',()=>{
 const q=bank[0];
 const out=complete({kind:'mock',answers:{[q[0]]:(q[5]+1)%q[4].length}});
 assert.equal(out.state.results.at(-1).kind,'mock');
 assert.equal(out.state.results.at(-1).correct,0);
 assert.equal(out.state.results.at(-1).total,1);
 assert.match(out.html,/0 \/ 1/);
 assert.match(out.html,/نتيجة الجلسة/);
 assert.equal(out.session,null);
});

test('ending an unanswered mock shows safe zero-grade message, not NaN',()=>{
 const out=complete({kind:'mock',answers:{}});
 assert.equal(out.state.results.at(-1).total,0);
 assert.match(out.html,/لم تُجب عن أي سؤال/);
 assert.doesNotMatch(out.html,/NaN|Infinity/);
 assert.equal(out.session,null);
});

test('ending a timed mock releases the active timer and persists results once',()=>{
 const marker={synthetic:true};
 const q=bank[0];
 const out=complete({kind:'mock',answers:{[q[0]]:q[5]},timer:marker});
 assert.deepEqual(out.cleared,[marker]);
 assert.equal(out.state.results.length,1);
 assert.equal(out.state.results[0].correct,1);
 assert.match(out.html,/1 \/ 1/);
});
