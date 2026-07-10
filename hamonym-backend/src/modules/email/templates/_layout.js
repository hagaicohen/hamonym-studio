exports.wrapHtml = (bodyHtml) => `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:20px;font-weight:800;color:#583cd6;">המונים</span>
    </div>
    <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 6px rgba(15,23,42,.06);">
      ${bodyHtml}
    </div>
    <div style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8;">
      נשלח ממערכת המונים
    </div>
  </div>
</body>
</html>`;
