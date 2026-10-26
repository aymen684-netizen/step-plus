import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG checks only on a localhost-hosted offline development preview.
// No CDN, real user draft, provider call or production authentication.
const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'];

async function ready(page,width){
 await page.setViewportSize({width,height:844});
 const outside=[];
 await page.route('**/*',async route=>{
  const hostname=new URL(route.request().url()).hostname;
  if(hostname==='127.0.0.1'||hostname==='localhost')return route.continue();
  outside.push(hostname);
  return route.abort('blockedbyclient');
 });
 await page.goto('/ai-studio.html',{waitUntil:'networkidle'});
 await expect(page.getByRole('heading',{name:/استوديو المحادثة والكتابة/})).toBeVisible();
 return outside;
}

async function audit(page){
 const report=await new AxeBuilder({page}).withTags(tags).analyze();
 const issues=report.violations.map(v=>({
  id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target.join(' ')).slice(0,6)
 }));
 expect(issues,'WCAG A/AA violations: '+JSON.stringify(issues)).toEqual([]);
}

test('desktop: initial writing studio has no detectable WCAG A/AA violations',async({page})=>{
 const outside=await ready(page,1280);
 await audit(page);
 expect(outside).toEqual([]);
});

test('mobile 375px: initial studio has no detectable WCAG A/AA violations',async({page})=>{
 const outside=await ready(page,375);
 await audit(page);
 expect(outside).toEqual([]);
});

test('mobile 390px: expanded synthetic writing feedback has no detectable WCAG A/AA violations',async({page})=>{
 const outside=await ready(page,390);
 await page.getByRole('button',{name:'معاينة تقرير تصحيح تجريبي'}).click();
 await expect(page.locator('#feedbackPreview')).toContainText('تقرير تعليمي');
 await audit(page);
 expect(outside).toEqual([]);
});

test('small mobile 320px: expanded offline preview has no detectable WCAG A/AA violations',async({page})=>{
 const outside=await ready(page,320);
 await page.getByRole('button',{name:'معاينة تقرير تصحيح تجريبي'}).click();
 await expect(page.locator('#feedbackPreview')).toContainText('تقرير تعليمي');
 await audit(page);
 expect(outside).toEqual([]);
});

test('tablet 768px: initial writing studio has no detectable WCAG A/AA violations',async({page})=>{
 const outside=await ready(page,768);
 await audit(page);
 expect(outside).toEqual([]);
});
