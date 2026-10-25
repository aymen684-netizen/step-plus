import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderWritingFeedback} from '../src/writing-feedback-renderer.mjs';

// A tiny DOM contract mock: any use of HTML parsing must fail these tests.
// Browser rendering and mobile accessibility require separate E2E validation.
class FakeNode {
 constructor(tag,doc){
  this.tagName=tag;this.ownerDocument=doc;this.children=[];this._text='';this.attrs={};
 }
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 set innerHTML(_){throw Error('HTML parsing forbidden');}
 get innerHTML(){throw Error('HTML parsing forbidden');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this._text='';this.children=[...children];}
 setAttribute(name,value){this.attrs[name]=String(value);}
}
function container(){
 const doc={createElement(tag){return new FakeNode(tag,doc)}};
 return new FakeNode('div',doc);
}
const valid={
 feedback:{
  summary:'Your paragraph is coherent.',
  strengths:['Clear message','Useful vocabulary'],
  corrections:[{original:'She go',suggestion:'She goes',reason:'Third-person -s'}],
  nextTask:'Revise your paragraph.',
  scores:{taskCompletion:88,grammar:72,coherence:80,vocabulary:75}
 }
};
const copy=()=>JSON.parse(JSON.stringify(valid));

test('renders structured feedback using text nodes',()=>{
 const root=container();
 assert.equal(renderWritingFeedback(root,valid),true);
 assert.equal(root.attrs['aria-live'],'polite');
 assert.match(root.textContent,/Your paragraph is coherent/);
 assert.match(root.textContent,/She goes/);
 assert.match(root.textContent,/72 \/ 100/);
 assert.match(root.textContent,/غير معتمد/);
});

test('malicious HTML remains literal text and does not create executable nodes',()=>{
 const data=copy();
 const attack='<img src=x onerror=alert(1)><script>alert("x")</script>';
 data.feedback.summary=attack;
 data.feedback.corrections[0].suggestion=attack;
 const root=container();
 assert.equal(renderWritingFeedback(root,data),true);
 assert.ok(root.textContent.includes(attack));
 function tags(node){return [node.tagName,...node.children.flatMap(tags)];}
 assert.equal(tags(root).includes('img'),false);
 assert.equal(tags(root).includes('script'),false);
});

test('invalid score is rejected and not reflected',()=>{
 const d=copy();d.feedback.scores.grammar=999;
 const root=container();
 assert.equal(renderWritingFeedback(root,d),false);
 assert.doesNotMatch(root.textContent,/999/);
 assert.match(root.textContent,/بيانات غير صالحة/);
});

test('invalid nested fields and null response are rejected',()=>{
 for(const mutate of [
  d=>{d.feedback.corrections=[null]},
  d=>{d.feedback.corrections[0].reason={malicious:'object'}},
  d=>{d.feedback.strengths='unsafe'},
  d=>{d.feedback.nextTask=''},
  d=>{d.feedback.scores.coherence='95'}
 ]){
  const d=copy();mutate(d);
  assert.equal(renderWritingFeedback(container(),d),false);
 }
 assert.equal(renderWritingFeedback(container(),null),false);
});

test('renders empty strengths and corrections without errors',()=>{
 const d=copy();d.feedback.strengths=[];d.feedback.corrections=[];
 const root=container();
 assert.equal(renderWritingFeedback(root,d),true);
 assert.match(root.textContent,/لا توجد تصحيحات/);
});

test('does not expose the original draft or unrelated API properties',()=>{
 const d=copy();d.draft='PRIVATE DRAFT SHOULD NOT BE DISPLAYED';
 d.feedback.secret='PRIVATE API SECRET';
 const root=container();
 assert.equal(renderWritingFeedback(root,d),true);
 assert.doesNotMatch(root.textContent,/PRIVATE DRAFT|PRIVATE API SECRET/);
});

test('replaces previous content rather than stacking or retaining stale feedback',()=>{
 const root=container();
 assert.equal(renderWritingFeedback(root,valid),true);
 const changed=copy();changed.feedback.summary='Updated summary only.';
 assert.equal(renderWritingFeedback(root,changed),true);
 assert.match(root.textContent,/Updated summary only/);
 assert.doesNotMatch(root.textContent,/Your paragraph is coherent/);
});

test('rejects missing DOM container',()=>{
 assert.throws(()=>renderWritingFeedback(null,valid),TypeError);
});

test('renderer source contains no HTML parsing, fetch or storage APIs',()=>{
 const source=readFileSync(new URL('../src/writing-feedback-renderer.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b/);
});
