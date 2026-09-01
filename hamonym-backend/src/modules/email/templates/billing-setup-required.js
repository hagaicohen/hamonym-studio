const { wrapHtml } = require('./_layout');

// Never states an amount owed to Hamonym — fee_rate/vat_rate/total_due are
// not known until a billing_account exists (see billing-setup-notification
// .service.js). Gross donation activity is safe to show because it is
// already a known fact, independent of any commercial terms.
module.exports = (data) => {
  const { entityName, donationCount, grossAmount, settingsUrl } = data;
  const grossText = grossAmount != null
    ? `₪${Number(grossAmount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;
  const activityLine = grossText ? ` (${donationCount} תרומות, ${grossText})` : '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">נדרשת השלמת הגדרות חיוב</h2>
    <p style="color:#475569;line-height:1.6;">
      במהלך תקופת החיוב האחרונה התקבלו תרומות עבור <strong>${entityName}</strong>${activityLine},
      אך לא ניתן להשלים את חישוב דמי השימוש ב-Hamonym מאחר שהגדרות החיוב של העמותה טרם הושלמו.
    </p>
    <p style="color:#475569;line-height:1.6;">
      יש להשלים את פרטי החיוב כדי שנוכל להפיק את חשבון החיוב עבור התקופה.
    </p>
    <a href="${settingsUrl}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
      להשלמת הגדרות החיוב
    </a>
  `);

  const text = `נדרשת השלמת הגדרות חיוב — ${entityName}

במהלך תקופת החיוב האחרונה התקבלו תרומות עבור ${entityName}${activityLine}, אך לא ניתן להשלים את חישוב דמי השימוש ב-Hamonym מאחר שהגדרות החיוב של העמותה טרם הושלמו.

יש להשלים את פרטי החיוב כדי שנוכל להפיק את חשבון החיוב עבור התקופה:
${settingsUrl}`;

  return { subject: `נדרשת השלמת הגדרות חיוב — ${entityName}`, html, text };
};
