import {test,expect} from '../support/fixtures';
import {STUDIO_ID,STUDIO_ROW,installStudio,closeStudioOverlays} from '../support/studio';
test('upper rail insertion control is fully painted and opens the existing insertion menu',async({page,api,openAs})=>{
 const row={...structuredClone(STUDIO_ROW),layout:{layoutMode:'sidebar-left',heroPlacement:'main-column'}};
 await openAs('manager',`/campaigns/${STUDIO_ID}/studio?visualPilot=1`,()=>installStudio(api,row));await closeStudioOverlays(page);
 const button=page.locator('.canvas-frame .sidebar-rail [data-insert-before="b-donate"]');
 await button.scrollIntoViewIfNeeded();await page.locator('.sidebar-rail [data-block-id="b-donate"]').hover();
 await expect(button).toHaveCSS('opacity','1');
 await expect.poll(()=>button.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect();return [2,r.height/2,r.height-2].every(y=>el.contains(document.elementFromPoint(r.x+r.width/2,r.y+y)));})).toBe(true);
 await button.screenshot({path:test.info().outputPath('upper-insert-button.png')});await button.click();await expect(page.locator('.add-menu')).toBeVisible();expect(api.unmatched).toEqual([]);
});
