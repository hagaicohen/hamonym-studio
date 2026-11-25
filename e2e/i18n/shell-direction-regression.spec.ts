import {test,expect,type Page} from '../support/fixtures';
import {STUDIO_ID,installStudio,studioContentLanguage} from '../support/studio';
async function sidebar(page:Page,lang:string){
 const mobile=page.viewportSize()!.width<=768;
 if(mobile)await page.locator('app-topbar .mobile-menu-btn').click();
 const side=page.locator('app-sidebar .sidebar');await expect(side).toBeVisible();
 const width=page.viewportSize()!.width;
 await expect.poll(async()=>{const r=await side.boundingBox();return lang==='he'?Math.abs(r!.x+r!.width-width):Math.abs(r!.x);}).toBeLessThan(2);
 const b=await side.boundingBox();
 if(lang==='he')expect(Math.abs(b!.x+b!.width-width)).toBeLessThan(2);else expect(Math.abs(b!.x)).toBeLessThan(2);
 if(!mobile){const m=await page.locator('.app-content').boundingBox();if(lang==='he')expect(m!.x+m!.width).toBeLessThanOrEqual(b!.x+1);else expect(m!.x).toBeGreaterThanOrEqual(b!.x+b!.width-1);}
 return side;
}
async function choose(page:Page,lang:string){await page.locator('app-topbar hm-language-switcher .hm-ls__trigger').click();await page.getByRole('menuitemradio',{name:lang==='en'?'English':'Hebrew',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir',lang==='en'?'ltr':'rtl');}
test('authenticated shell follows and persists language across Campaigns Dashboard and Studio',async({page,api,openAs,hmLang})=>{
 test.setTimeout(120_000); await openAs('manager','/campaigns');
 const token=await page.evaluate(()=>localStorage.getItem('token'));
 await expect(page.locator('html')).toHaveAttribute('dir',hmLang==='he'?'rtl':'ltr');
 await expect(page.locator('app-topbar hm-language-switcher .hm-ls__trigger')).toBeVisible();
 await expect(page.locator('.topbar')).toHaveCSS('direction',hmLang==='he'?'rtl':'ltr');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 let side=await sidebar(page,hmLang);await expect(side.locator('a[href="/campaigns"]')).toContainText(hmLang==='he'?'קמפיינים':'Campaigns');
 await page.screenshot({path:test.info().outputPath(`shell-${hmLang}.png`),fullPage:true});
 if(page.viewportSize()!.width<=768)await page.locator('.mobile-overlay').click({position:{x:hmLang==='he'?5:page.viewportSize()!.width-5,y:150}});
 const other=hmLang==='he'?'en':'he';await choose(page,other);side=await sidebar(page,other);
 await expect(side.locator('a[href="/dashboard"]')).toContainText(other==='he'?'דשבורד':'Dashboard');
 await page.screenshot({path:test.info().outputPath(`shell-${other}.png`),fullPage:true});
 await side.locator('a[href="/dashboard"]').click();await expect(page).toHaveURL(/\/dashboard$/);await expect(page.locator('app-topbar hm-language-switcher')).toBeVisible();
 side=await sidebar(page,other);await side.locator('a[href="/campaigns"]').click();await expect(page).toHaveURL(/\/campaigns$/);
 await page.reload();await expect(page.locator('app-topbar hm-language-switcher .hm-ls__trigger')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir',other==='he'?'rtl':'ltr');expect(await page.evaluate(()=>localStorage.getItem('token'))).toBe(token);
 expect(await page.evaluate(()=>localStorage.getItem('hm.ui.lang'))).toBe(other);
 if(page.viewportSize()!.width<=768){await sidebar(page,other);await page.locator('app-topbar .mobile-menu-btn').click();}
 await choose(page,hmLang);await expect(page.locator('html')).toHaveCSS('direction',hmLang==='he'?'rtl':'ltr');
 installStudio(api);await page.goto(`/campaigns/${STUDIO_ID}/studio?visualPilot=1`);await expect(page.locator('.studio-topbar--creative')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir',hmLang==='he'?'rtl':'ltr');
 await studioContentLanguage(page,hmLang);await expect(page.locator('.canvas-frame')).toHaveCSS('direction',hmLang==='he'?'rtl':'ltr');
 await page.screenshot({path:test.info().outputPath('studio-direction.png'),fullPage:true});
 expect(api.unmatched).toEqual([]);
});

