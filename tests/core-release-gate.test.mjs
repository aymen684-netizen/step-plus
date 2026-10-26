import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

// Deployment-free, read-only source checks: zero provider, Cloudflare,
// external web requests, learner accounts, or package installation.
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const pages=[
 'index.html','english.html','academy.html','reading-tests.html',
 'grammar-lab.html','library.html','ai-studio.html','skills-studio.html',
 'weekly.html','priority.html','step-legacy.html'
];
const corePages=pages.filter(name=>name!=='step-legacy.html');
// Legacy icon references need review: tracked separately in GitHub issue #18.
// Do not misrepresent unverified legacy assets as having passed link validation.
function inlineScripts(html) {
 const matches=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 return matches.filter(x=>!/\bsrc\s*=/.test(x[1])&&!/\btype\s*=\s*['"]module['"]/.test(x[1]));
}
for(const name of pages){
 test(name+': Arabic page metadata and syntax of all classic inline scripts',()=>{
  const html=read(name);
  assert.match(html,/<html\b[^>]*\blang=["']ar["']/i);
  assert.match(html,/<html\b[^>]*\bdir=["']rtl["']/i);
  assert.match(html,/<meta\b[^>]*\bname=["']viewport["']/i);
  assert.match(html,/<title\b[^>]*>[^<]+<\/title>/i);
  assert.match(html,/<main\b/i);
  const scripts=inlineScripts(html);
  assert.ok(scripts.length>=1,name+' must include its expected classic script');
  for(const [, ,js] of scripts)assert.doesNotThrow(()=>new Script(js,{filename:name}),name+' inline JS syntax');
 });
}
test('all static primary navigation links point to existing repository files',()=>{
 for(const name of corePages){
  const staticMarkup=read(name).split(/<script\b/i)[0];
  const links=[...staticMarkup.matchAll(/<(?:a|link)\b[^>]*\bhref=["']([^"'<>]+)["']/gi)].map(x=>x[1]);
  for(const href of links){
   if(/^(?:https?:|mailto:|data:|#|javascript:)/i.test(href))continue;
   const local=href.split(/[?#]/)[0];
   if(!local||local==='.'||local==='./'){
    assert.ok(existsSync(resolve(root,'index.html')),name+' root index');
    continue;
   }
   assert.ok(!local.startsWith('/'),name+' must keep repo-scoped relative URL: '+local);
   const resolved=resolve(dirname(resolve(root,name)),local);
   assert.ok(resolved.startsWith(root),name+' must not escape repository root');
   assert.ok(existsSync(resolved),name+' unresolved path '+local);
  }
 });
});
test('deploy workflow publishes from main push only, never from a PR',()=>{
 const deploy=read('.github/workflows/deploy.yml');
 assert.match(deploy,/on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);
 assert.doesNotMatch(deploy,/(?:^|\n)\s*pull_request(?:_target)?:/);
 assert.doesNotMatch(deploy,/(?:^|\n)\s*workflow_run:/);
 assert.match(deploy,/environment:\s*\n\s*name:\s*github-pages/);
 assert.match(deploy,/contents:\s*read/);
});
test('public assets do not embed recognizable permanent provider or repository keys',()=>{
 const locations=[...pages,'src/realtime-voice.js','sw.js','manifest.webmanifest'];
 const patterns=[
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{25,})\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
 ];
 for(const name of locations){
  const src=read(name);
  for(const p of patterns){p.lastIndex=0;assert.equal(p.test(src),false,'potential key signature in '+name);}
 }
});
test('reading scores include only text-supported answers',()=>{
 const html=read('reading-tests.html');
 assert.match(html,/let verified=attempted\.filter\(q=>q\.reviewStatus==='text-supported'\)/);
 assert.match(html,/let pending=attempted\.filter\(q=>q\.reviewStatus!=='text-supported'\)/);
 assert.match(html,/q\.reviewStatus==='text-supported'/);
});
test('learning placement is explicitly indicative rather than certified',()=>{
 const html=read('index.html');
 assert.match(html,/مؤشر أولي وليس شهادة مستوى/);
 assert.match(html,/لا يعادل اختبار CEFR الرسمي/);
 const ids=html.match(/if\(type==='placement'\)\{ids=\[([\d,]+)\]\}/)?.[1]?.split(',').map(Number);
 assert.equal(ids?.length,10);
 assert.equal(new Set(ids).size,10);
});
test('service worker and offline manifest syntax remain valid',()=>{
 assert.doesNotThrow(()=>new Script(read('sw.js'),{filename:'sw.js'}));
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.start_url);
});
