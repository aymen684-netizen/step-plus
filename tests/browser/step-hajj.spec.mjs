import {test,expect} from '@playwright/test';

// Locally served synthetic source only: no account, Cloudflare or provider traffic.
async function open(page) {
 const external=[];
 await page.route('**/*',async route=>{
  const host=new URL(route.request().url()).hostname;
  if(host==='127.0.0.1'||host==='localhost')return route.continue();
  external.push(host);return route.abort('blockedbyclient');
 });
 await page.goto('/academy.html',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:/تعلّم.*تدرّب.*اختبر/})).toBeVisible();
 return external;
}
const ids=page=>page.evaluate('sess.ids.slice()');

test('Hajj passage hides unverified outside-pilgrim answer yet allows known question',async({page})=>{
 const external=await open(page);
 await page.locator('#tabs button[onclick="page(\'reading\')"]').click();
 await expect(page.locator('#view')).toContainText('موقوف عن التصحيح');
 await page.getByRole('button',{name:'اختبر نفسك في هذه القطعة'}).first().click();
 expect(await ids(page)).toEqual(['r1']);
 await expect(page.locator('#view')).toContainText('Which year had the most pilgrims in the chart?');
 await page.locator('#choices .choice').nth(3).click();
 await page.locator('#nextbtn').click();
 await expect(page.locator('#view')).toContainText('نتيجة الجلسة');
 await expect(page.locator('#view')).toContainText('1 / 1');
 expect(external).toEqual([]);
});

test('reading, mock and review never select the suspended r2 question',async({page})=>{
 const external=await open(page);
 await page.locator('#tabs button[onclick="page(\'practice\')"]').click();
 await expect(page.locator('#view')).toContainText('المتبقي غير المستخدم: 25 من 25');
 await page.getByRole('button',{name:'تدريب القراءة'}).click();
 const reading=await ids(page);
 expect(reading.length).toBe(13);
 expect(reading).not.toContain('r2');
 await page.locator('#tabs button[onclick="page(\'mock\')"]').click();
 await page.getByRole('button',{name:'محاكاة مراجعة شاملة'}).click();
 expect(await ids(page)).not.toContain('r2');
 await page.locator('#tabs button[onclick="page(\'mock\')"]').click();
 await page.getByRole('button',{name:'محاكاة بأسئلة غير مستخدمة'}).click();
 expect(await ids(page)).not.toContain('r2');
 expect(external).toEqual([]);
});

test('historical localStorage entries for suspended r2 do not inflate progress or mistakes',async({page})=>{
 const external=await open(page);
 await page.evaluate(()=>{
  localStorage.setItem('step-academy-v1',JSON.stringify({
   seen:['r2','g1'],mistakes:['r2','r1'],results:[],diagnostic:false
  }));
 });
 await page.reload();
 await page.locator('#tabs button[onclick="page(\'practice\')"]').click();
 await expect(page.locator('#view')).toContainText('المتبقي غير المستخدم: 24 من 25');
 await page.locator('#tabs button[onclick="page(\'mistakes\')"]').click();
 await expect(page.locator('#view')).toContainText('عدد الأخطاء الفريدة: 1');
 await expect(page.locator('#view')).not.toContainText('Which year had the most pilgrims from outside Saudi Arabia');
 expect(external).toEqual([]);
});
