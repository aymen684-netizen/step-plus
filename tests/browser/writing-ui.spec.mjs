import {test,expect} from '@playwright/test';

const SAMPLE='SYNTHETIC_ENGLISH_PLUS_PRIVATE_DRAFT_DO_NOT_UPLOAD';
async function openLocalStudio(page){
 const external=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'||url.hostname==='localhost'){
   await route.continue();
  }else{
   external.push(url.hostname);
   await route.abort('blockedbyclient');
  }
 });
 await page.goto('/ai-studio.html',{waitUntil:'networkidle'});
 await expect(page.getByRole('heading',{name:/استوديو المحادثة والكتابة/})).toBeVisible();
 return external;
}
const previewButton=page=>page.getByRole('button',{name:'معاينة تقرير تصحيح تجريبي'});
const preview=page=>page.locator('#feedbackPreview');

test('desktop: offline report renders scores without reading the draft',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 const external=await openLocalStudio(page);
 await page.getByLabel('اكتب إجابتك بالإنجليزية').fill(SAMPLE);
 await previewButton(page).click();
 await expect(preview(page)).toContainText('تقرير تعليمي');
 await expect(preview(page)).toContainText('70 / 100');
 await expect(preview(page)).not.toContainText(SAMPLE);
 expect(external).toEqual([]);
 const positions=await page.locator('.cards > .card').evaluateAll(els=>els.map(x=>x.getBoundingClientRect().x));
 expect(positions).toHaveLength(2);
 expect(Math.abs(positions[0]-positions[1])).toBeGreaterThan(80);
});

for(const width of [390,375]){
 test('mobile '+width+'px: preview is reachable and no horizontal overflow',async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const external=await openLocalStudio(page);
  await previewButton(page).click();
  await expect(preview(page)).toContainText('تصحيحات مقترحة');
  const metrics=await page.evaluate(()=>({
   viewport:document.documentElement.clientWidth,
   scrollWidth:document.documentElement.scrollWidth
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport+1);
  const columns=await page.locator('.cards > .card').evaluateAll(els=>els.map(x=>x.getBoundingClientRect().x));
  expect(Math.abs(columns[0]-columns[1])).toBeLessThan(2);
  expect(external).toEqual([]);
  await page.screenshot({path:'tests/browser-results/'+testInfo.project.name+'-mobile-'+width+'.png',fullPage:true});
 });
}

test('keyboard: preview works from Enter activation',async({page})=>{
 await openLocalStudio(page);
 await previewButton(page).focus();
 await page.keyboard.press('Enter');
 await expect(preview(page)).toContainText('الخطوة التالية');
});

test('malicious provider-like markup remains plain text, not HTML',async({page})=>{
 await openLocalStudio(page);
 const outcome=await page.evaluate(async()=>{
  const {renderWritingFeedback}=await import('/src/writing-feedback-renderer.mjs');
  const attack='<img src=x onerror=window.__hacked=true><script>window.__hacked=true</script>';
  const root=document.createElement('div');
  document.body.append(root);
  const success=renderWritingFeedback(root,{
   feedback:{
    summary:attack,
    strengths:[attack],
    corrections:[{original:attack,suggestion:attack,reason:attack}],
    nextTask:attack,
    scores:{taskCompletion:77,grammar:70,coherence:80,vocabulary:71}
   }
  });
  const result={
   success,
   visible:root.textContent.includes(attack),
   htmlElements:root.querySelectorAll('script,img,iframe,svg,object').length,
   injected:window.__hacked===true
  };
  root.remove();
  return result;
 });
 expect(outcome.success).toBe(true);
 expect(outcome.visible).toBe(true);
 expect(outcome.htmlElements).toBe(0);
 expect(outcome.injected).toBe(false);
});

test('local writing analysis remains offline and explicitly non-AI',async({page})=>{
 const external=await openLocalStudio(page);
 await page.getByLabel('اكتب إجابتك بالإنجليزية').fill('I practice English every day. Learning helps me communicate.');
 await page.getByRole('button',{name:'تحليل مبدئي'}).click();
 await expect(page.locator('#writeStatus')).toContainText('عدد الكلمات');
 await expect(page.locator('#writeStatus')).toContainText('ليس تصحيحًا ذكيًا');
 expect(external).toEqual([]);
});
