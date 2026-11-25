import {test,expect,settle} from '../support/fixtures';
import {STUDIO_ID,STUDIO_ROW,installStudio,openStudioProperties,closeStudioOverlays} from '../support/studio';
test('visual pilot selects, inserts exactly, saves and restores design with undo redo',async({page,api,openAs})=>{
 let row:any=structuredClone(STUDIO_ROW);
 await openAs('manager',`/campaigns/${STUDIO_ID}/studio?visualPilot=1`,()=>{installStudio(api);api.get('/api/campaigns/:id',()=>row);api.patch('/api/campaigns/:id',r=>{row={...row,...r.body as object};return row;});});
 await closeStudioOverlays(page);
 const block=page.locator('.canvas-frame [data-block-id="b-closing"]').first();await block.click();await openStudioProperties(page);
 await expect(page.locator('[data-visual-inspector]')).toBeVisible();await expect(page.locator('[data-all-block-settings]')).toHaveCount(0);
 await page.locator('[data-inspector-tab="layout"]').click();await page.locator('[data-width-mode="custom"]').click();await page.locator('[data-custom-width]').fill('380');await page.locator('[data-custom-width]').blur();await page.waitForTimeout(700);
 await page.screenshot({path:test.info().outputPath('contextual-layout.png'),fullPage:true});await closeStudioOverlays(page);await expect(block).toHaveCSS('max-width','380px');
 await page.locator('.studio-tools .tool-btn').first().click();await expect(block).not.toHaveCSS('max-width','380px');await page.locator('.studio-tools .tool-btn').nth(1).click();await expect(block).toHaveCSS('max-width','380px');
 await page.locator('app-campaign-studio-topbar .save-button').click();await expect.poll(()=>row.blocks.find((b:any)=>b.id==='b-closing').sectionStyle?.maxWidth).toBe(380);
 await page.reload();await settle(page,api);await closeStudioOverlays(page);await expect(block).toHaveCSS('max-width','380px');
 await expect(page.locator('[data-insert-before="b-closing"]').first()).toHaveAttribute('data-studio-control','');await block.hover();await page.locator('[data-insert-before="b-closing"]').first().click();const add=page.locator('.add-menu .add-item').filter({hasText:/Progress|התקדמות/}).first();await expect(add).toBeVisible();await add.click();await closeStudioOverlays(page);
 await expect(page.locator('.canvas-frame app-campaign-progress')).toHaveCount(1);await page.locator('app-campaign-studio-topbar .save-button').click();await expect.poll(()=>row.blocks.filter((b:any)=>b.type==='progress').length).toBe(1);
 const added=row.blocks.find((b:any)=>b.type==='progress');expect(added.order).toBeLessThan(row.blocks.find((b:any)=>b.id==='b-closing').order);
 await page.screenshot({path:test.info().outputPath('visual-pilot.png'),fullPage:true});expect(api.unmatched).toEqual([]);
});
test('legacy campaigns keep default section styles absent',async({page,api,openAs})=>{
 await openAs('manager',`/campaigns/${STUDIO_ID}/studio?visualPilot=0`,()=>installStudio(api));await expect(page.locator('[data-visual-inspector]')).toHaveCount(0);await expect(page.locator('.visual-insert')).toHaveCount(0);await expect(page.locator('.canvas-frame .hm-local-surface')).toHaveCount(0);
});

test('pilot donation composition reuses the same progress component without payment calls',async({page,api,openAs})=>{
 await openAs('manager',`/campaigns/${STUDIO_ID}/studio?visualPilot=1`,()=>installStudio(api));await closeStudioOverlays(page);await page.locator('.canvas-frame [data-block-id="b-donate"] h2').click();await openStudioProperties(page);await page.locator('[data-widget-progress]').check();await closeStudioOverlays(page);await expect(page.locator('.canvas-frame [data-block-id="b-donate"] app-campaign-progress')).toHaveCount(1);await expect(page.locator('.canvas-frame .hm-donate-btn').first()).toBeVisible();expect(api.unmatched).toEqual([]);
});
import {BI_SLUG,bilingualRow,installBilingualPublic} from '../support/bilingual';
import {sectionSurface,openingSurface,boundedSize} from '../../src/app/modules/campaigns/utils/studio-section-style';
test('section inheritance keeps absent defaults and isolates device overrides',()=>{const b:any={sectionStyle:{padding:16,background:'#ffffff'},responsive:{mobile:{sectionStyle:{padding:8}}}};expect(sectionSurface(b,false)).toEqual({padding:16,background:'#ffffff'});expect(sectionSurface(b,true)).toEqual({padding:8,background:'#ffffff'});expect(sectionSurface({} as any,false)).toEqual({});expect(openingSurface({layout:{}} as any,true)).toEqual({});expect(boundedSize(999,0,101)).toBe(101);});
test('public campaign applies saved pilot styles without editor controls',async({page,api,openAs})=>{
 const content=bilingualRow();const block={id:'pilot-public-text',type:'rich-text',label:'',order:0,visible:true,sectionStyle:{background:'#e0f2fe',padding:16,maxWidth:760},responsive:{mobile:{sectionStyle:{padding:8,maxWidth:300}}},data:{content:'<p>Public pilot content</p>'}};
 await openAs('anonymous',`/campaigns/${BI_SLUG}?lang=he`,()=>{installBilingualPublic(api);api.get('/api/campaigns/public/:slug',{...content,blocks:[block]});});
 const surface=page.locator('.hm-local-surface').first();await expect(surface).toHaveCSS('background-color','rgb(224, 242, 254)');await expect(surface).toHaveCSS('padding',(page.viewportSize()!.width<=768?'8':'16')+'px');await expect(page.locator('.visual-insert,[data-visual-inspector],[data-block-id]')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(api.unmatched).toEqual([]);
});
test('plus inside a nested container preserves its parent and sibling order',async({page,api,openAs})=>{
 let row:any=structuredClone(STUDIO_ROW);await openAs('manager',`/campaigns/${STUDIO_ID}/studio?visualPilot=1`,()=>{installStudio(api);api.get('/api/campaigns/:id',()=>row);api.patch('/api/campaigns/:id',r=>{row={...row,...r.body as object};return row;});});await closeStudioOverlays(page);
 const button=page.locator('[data-insert-before="b-left"]');await page.locator('.canvas-frame [data-block-id="b-left"]').hover();await button.click();await page.locator('.add-menu .add-item').filter({hasText:/Progress|התקדמות/}).first().click();await closeStudioOverlays(page);await expect(page.locator('.canvas-frame [data-block-id="b-frame"] app-campaign-progress')).toHaveCount(1);await page.locator('app-campaign-studio-topbar .save-button').click();await expect.poll(()=>row.blocks.filter((b:any)=>b.type==='progress').length).toBe(1);const progress=row.blocks.find((b:any)=>b.type==='progress');expect(row.blocks.find((b:any)=>b.id==='b-frame').data.childBlockIds).toContain(progress.id);expect(progress.order).toBeLessThan(row.blocks.find((b:any)=>b.id==='b-left').order);expect(api.unmatched).toEqual([]);
});
