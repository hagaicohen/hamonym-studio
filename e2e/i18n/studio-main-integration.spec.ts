import {test,expect} from '../support/fixtures';
import {bilingualRow,installBilingualPublic,BI_SLUG} from '../support/bilingual';
import {STUDIO_ID,installStudio,closeStudioOverlays} from '../support/studio';

test('Main defaults to Visual Builder and keeps explicit legacy rollback',async({page,api,openAs})=>{
 await openAs('manager',`/campaigns/${STUDIO_ID}/studio`,()=>installStudio(api));
 await expect(page.locator('.studio-topbar--creative')).toBeVisible();
 await closeStudioOverlays(page);
 await page.goto(`/campaigns/${STUDIO_ID}/studio?visualPilot=0`);
 await expect(page.locator('app-campaign-studio-topbar')).toBeVisible();
 await expect(page.locator('.studio-topbar--creative')).toHaveCount(0);
 expect(api.unmatched).toEqual([]);
});

test('Main currency selection survives graphic cards and reaches mocked Checkout without conversion',async({page,api,openAs,hmLang})=>{
 const row:any=bilingualRow();row.layout={...row.layout,donationCurrencies:['USD','EUR'],currencyPresets:{USD:{oneTime:[20,40,80],monthly:[10,20]}},amountButtons:{cards:{'once:20':{mode:'layered',title:'Support',backgroundColor:'#e0f2fe'}}}};
 let calls:any;
 await openAs('anonymous',`/campaigns/${BI_SLUG}?lang=${hmLang}`,()=>{
  calls=installBilingualPublic(api);api.get('/api/campaigns/public/:slug',row);
  api.get('/api/donations/currencies',{currencies:['ILS','USD','EUR'],recurringCurrencies:['ILS']});
 });
 const widget=page.locator('.hm-donate:not(.hm-register)').first();
 await widget.locator('.hm-currency-btn').filter({hasText:'USD'}).click();
 await expect(widget.locator('.hm-amount-preset').first()).toContainText('$20');
 await expect(widget.locator('.hm-currency-symbol')).toHaveText('$');
 const monthly=widget.locator('.hm-frequency-btn').last();if(await monthly.count())await expect(monthly).toBeDisabled();
 await widget.locator('.hm-amount-preset').first().click();
 await widget.locator('.hm-primary-donate-cta').click();
 const checkout=page.locator('app-checkout-v2');await expect(checkout.locator('.cv2-drawer')).toBeVisible();
 await expect(checkout.locator('.cv2-currency-btn[aria-checked="true"]')).toContainText('USD');
 await expect(checkout.locator('.cv2-footer-amount')).toContainText('$20');
 expect(calls.bodies).toHaveLength(0);
 await checkout.locator('.cv2-currency-btn').filter({hasText:'EUR'}).click();
 await expect(checkout.locator('.cv2-custom-amount')).toHaveValue('');
 await expect(checkout.locator('.cv2-cta')).toBeDisabled();
 expect(calls.bodies).toHaveLength(0);expect(api.unmatched).toEqual([]);
});



