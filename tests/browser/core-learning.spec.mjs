import {test,expect} from '@playwright/test';

// All tests run against Playwright's localhost webServer. They never authenticate,
// send real learner content, call Cloudflare, or contact OpenAI.
async function visit(page,path){
 const outside=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(['localhost','127.0.0.1'].includes(url.hostname))return route.continue();
  outside.push(url.hostname);
  return route.abort('blockedbyclient');
 });
 await page.goto(path,{waitUntil:'domcontentloaded'});
 return outside;
}
const answerOptions=page=>page.locator('#options button');

test('English+ home presents level assessment and STEP learning links',async({page})=>{
 const outside=await visit(page,'/index.html');
 await expect(page.getByRole('heading',{name:/طوّر لغتك الإنجليزية/})).toBeVisible();
 await expect(page.locator('a[href="./academy.html"]').first()).toHaveAttribute('href','./academy.html');
 await page.getByRole('button',{name:'تحديد المستوى',exact:true}).click();
 await expect(page.locator('#content')).toContainText('10 أسئلة متنوعة');
 await expect(page.locator('#content')).toContainText('لا تختبر المحادثة والكتابة بالتفصيل');
 expect(outside).toEqual([]);
});

test('English+ ten-question placement scores perfect answers as an indicative C1 and persists',async({page})=>{
 const outside=await visit(page,'/index.html');
 await page.getByRole('button',{name:'تحديد المستوى',exact:true}).click();
 await page.getByRole('button',{name:'ابدأ اختبار التقييم'}).click();
 for(let n=0;n<10;n++){
  await expect(answerOptions(page)).toHaveCount(4);
  await expect(page.locator('#next')).toBeDisabled();
  const correct=await page.evaluate('Q[current.ids[current.idx]][4]');
  expect(correct).toBeGreaterThanOrEqual(0);
  expect(correct).toBeLessThan(4);
  await answerOptions(page).nth(correct).click();
  await expect(page.locator('#feedback')).toContainText('إجابة صحيحة');
  await expect(page.locator('#next')).toBeEnabled();
  await page.locator('#next').click();
 }
 await expect(page.locator('#content')).toContainText('10 من 10');
 await expect(page.locator('#content')).toContainText('100%');
 await expect(page.locator('#content')).toContainText('مستوى البداية التقريبي');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishplus-general-v1')));
 expect(saved.placement).toEqual({level:'C1',score:100});
 expect(saved.seen).toEqual([]); // diagnostic questions must not consume the practice bank
 await page.reload();
 await expect(page.locator('#content')).toContainText('C1 — 100%');
 expect(outside).toEqual([]);
});

test('English+ zero-score placement returns indicative A1, not official certification',async({page})=>{
 const outside=await visit(page,'/index.html');
 await page.getByRole('button',{name:'تحديد المستوى',exact:true}).click();
 await page.getByRole('button',{name:'ابدأ اختبار التقييم'}).click();
 for(let n=0;n<10;n++){
  const correct=await page.evaluate('Q[current.ids[current.idx]][4]');
  const size=await answerOptions(page).count();
  await answerOptions(page).nth((correct+1)%size).click();
  await page.locator('#next').click();
 }
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishplus-general-v1')));
 expect(saved.placement).toEqual({level:'A1',score:0});
 await expect(page.locator('#content')).toContainText('مؤشر أولي وليس شهادة مستوى');
 expect(outside).toEqual([]);
});

test('English+ mixed practice saves one answered question and shows progress',async({page})=>{
 const outside=await visit(page,'/index.html');
 await page.getByRole('button',{name:'تدريبات اللغة',exact:true}).click();
 await page.getByRole('button',{name:'تدريب مختلط'}).click();
 await expect(page.locator('#next')).toBeDisabled();
 await answerOptions(page).first().click();
 await expect(page.locator('#next')).toBeEnabled();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishplus-general-v1')));
 expect(saved.seen).toHaveLength(1);
 await page.reload();
 await page.getByRole('button',{name:'تقدمي',exact:true}).click();
 await expect(page.locator('#content')).toContainText('الأسئلة المحلولة: 1');
 expect(outside).toEqual([]);
});

test('STEP academy eight-question diagnostic scores and persists separately from practice',async({page})=>{
 const outside=await visit(page,'/academy.html');
 await expect(page.getByRole('heading',{name:/تعلّم.*تدرّب.*اختبر/})).toBeVisible();
 await page.getByRole('button',{name:'ابدأ تحديد المستوى'}).click();
 for(let n=0;n<8;n++){
  await expect(page.locator('#choices .choice')).toHaveCount(4);
  await expect(page.locator('#nextbtn')).toBeDisabled();
  const correct=await page.evaluate('one(sess.ids[sess.idx])[5]');
  await page.locator('#choices .choice').nth(correct).click();
  await expect(page.locator('#feedback')).toContainText('إجابة صحيحة');
  await expect(page.locator('#nextbtn')).toBeEnabled();
  await page.locator('#nextbtn').click();
 }
 await expect(page.locator('#view')).toContainText('نتيجة الجلسة');
 await expect(page.locator('#view')).toContainText('8 / 8');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('step-academy-v1')));
 expect(saved.diagnostic).toBe(true);
 expect(saved.seen).toHaveLength(0);
 expect(saved.results.at(-1)).toMatchObject({kind:'diagnostic',correct:8,total:8});
 await page.reload();
 await expect(page.getByRole('button',{name:'إعادة التقييم'})).toBeVisible();
 expect(outside).toEqual([]);
});

test('STEP mock has a bounded training timer and grades attempted questions only',async({page})=>{
 const outside=await visit(page,'/academy.html');
 await page.locator('#tabs button[onclick="page(\'mock\')"]').click();
 await page.getByRole('button',{name:'محاكاة بأسئلة غير مستخدمة'}).click();
 await expect(page.locator('#clock')).toContainText(/24:5\d|25:00/);
 await page.locator('#choices .choice').first().click();
 await page.getByRole('button',{name:'إنهاء الآن'}).click();
 await expect(page.locator('#view')).toContainText('نتيجة الجلسة');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('step-academy-v1')));
 expect(saved.results.at(-1).kind).toBe('mock');
 expect(saved.results.at(-1).total).toBe(1);
 expect(outside).toEqual([]);
});

test('STEP reading does not grade a question whose evidence is still unverified',async({page})=>{
 const outside=await visit(page,'/reading-tests.html');
 await page.locator('#groups button').filter({hasText:'A Graph Regarding Hajj Pilgrims'}).first().click();
 await expect(page.locator('#progress')).toContainText('السؤال 1');
 await page.locator('#options button.choice').first().click();
 await expect(page.locator('#why')).toContainText('السؤال قيد المراجعة');
 await page.getByRole('button',{name:'إنهاء التدريب'}).click();
 await expect(page.locator('#score')).toContainText('0 / 0');
 await expect(page.locator('#score')).toContainText('1 أسئلة غير محسوبة');
 expect(outside).toEqual([]);
});

test('STEP reading counts only a text-supported answer and persists seen question',async({page})=>{
 const outside=await visit(page,'/reading-tests.html');
 await page.locator('#filter').fill('Controlling Inflation');
 await page.locator('#groups button').first().click();
 await expect(page.locator('#question')).toContainText('inflation');
 await page.locator('#options button.choice').nth(1).click();
 await expect(page.locator('#why')).toContainText('دليل سياقي');
 await page.getByRole('button',{name:'إنهاء التدريب'}).click();
 await expect(page.locator('#score')).toContainText('1 / 1');
 await expect(page.locator('#score')).toContainText('0 أسئلة غير محسوبة');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('step-plus-reading-file-v1')));
 expect(saved).toContain('file-1-0');
 await page.reload();
 await expect(page.locator('#stats')).toContainText('المتبقي دون تكرار 58');
 expect(outside).toEqual([]);
});

test('STEP reading review metadata is internally coherent before scoring',async({page})=>{
 const outside=await visit(page,'/reading-tests.html');
 const bank=await page.evaluate('questions.map(q=>({id:q.id,options:q.options,title:q.title,question:q.question,reviewStatus:q.reviewStatus,reviewAnswer:q.reviewAnswer,evidence:q.evidence}))');
 expect(bank.length).toBeGreaterThanOrEqual(50);
 expect(new Set(bank.map(q=>q.id)).size).toBe(bank.length);
 expect(bank.some(q=>q.reviewStatus==='text-supported')).toBe(true);
 expect(bank.some(q=>q.reviewStatus!=='text-supported')).toBe(true);
 for(const q of bank){
  expect(q.id.length).toBeGreaterThan(0);
  expect(q.title.length).toBeGreaterThan(0);
  expect(q.question.length).toBeGreaterThan(0);
  expect(q.options.length).toBeGreaterThanOrEqual(2);
  if(q.reviewStatus==='text-supported'){
   expect(Number.isInteger(q.reviewAnswer)).toBe(true);
   expect(q.reviewAnswer).toBeGreaterThanOrEqual(0);
   expect(q.reviewAnswer).toBeLessThan(q.options.length);
   expect(q.evidence.trim().length).toBeGreaterThan(0);
  }else{
   expect(q.reviewAnswer).toBeNull();
  }
 }
 expect(outside).toEqual([]);
});

for(const path of ['/index.html','/academy.html','/reading-tests.html']){
 test('mobile 320px: '+path+' has no page-level horizontal overflow or uncaught script errors',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:320,height:700});
  const outside=await visit(page,path);
  const metrics=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport+1);
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
 });
}
