const { wrapHtml } = require('./_layout');

// Shared renderer for the operational (Super-Admin-facing) alert emails.
// NOT a registered template itself — it has no subject of its own; each
// registered admin template (admin-job-failed, admin-scheduler-stale,
// admin-operational-finding, admin-webhook-unresolved,
// admin-entity-hard-deleted) owns its own Hebrew subject and calls this for
// the body.
//
// Deliberately a different shape from the donor-facing templates: those are
// prose, this is a scan surface. Severity pill first, one sentence of what
// happened, then a flat label/value fact table (ids, timestamps, counts) and
// one explicit "is action required" line. No marketing, no CTA styling, no
// logo-heavy layout — it still reuses _layout.js's wrapHtml so there is one
// RTL/background/width definition in the project, not two.
//
// CONTENT RULE (enforced by the callers, asserted by
// scripts/test-admin-ops-notifications.js): facts carry identifiers,
// statuses, timestamps, counts and internal error strings ONLY. No donor
// name/email/phone, no card data, no CardCom credentials, no raw webhook
// payload dumps. An operator who needs the donor's details already has the
// Platform Admin screens; an email is the wrong place to copy them to.

const SEVERITY_STYLES = {
  critical: { label: 'קריטי', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  warning: { label: 'נדרשת בדיקה', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  info: { label: 'לידיעה', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  // A deliberate administrative action that already completed successfully
  // (e.g. entity_hard_deleted) is not a "problem" the way critical/warning
  // are — it is a permanent record of something a Super Admin did knowingly
  // and with authorization. Labeling it "קריטי" alongside an active
  // incident like scheduler_stale or gate_v1_mismatch would blur that
  // distinction for the reader. Same neutral tone/color as `info` — this is
  // a separate semantic label, not a new visual language.
  administrative: { label: 'אירוע מנהלי', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
};

function styleFor(severity) {
  return SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
}

function presentValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const str = String(value);
  return str.trim() === '' ? null : str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// DD/MM/YYYY HH:mm — the project's display convention (CLAUDE.md), with the
// time kept because "when did this break" is the first thing an operator
// asks. Returns null rather than a guess for an unparseable/absent input.
function formatTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A millisecond duration straight from job_runs is an implementation detail
// ("4213 מ"ש" means nothing to an operator deciding whether to worry) —
// shown as seconds (or minutes past 60s), one decimal, the smallest unit
// that is still immediately readable. Returns null rather than a guess for
// a missing/non-numeric input.
function formatDuration(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return null;
  const totalSeconds = Number(ms) / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} שניות`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} דקות ${seconds} שניות`;
}

// { severity, headline, summary, facts: [{label, value}], errorDetail,
//   actionRequired, actionUrl, actionLabel, note }
// actionRequired: a string (what the operator should do) or null — rendered
// as an explicit "לא נדרשת פעולה" when null, so the absence is a stated
// fact rather than an omission the reader has to interpret.
// actionUrl/actionLabel: optional — when both are given, actionRequired is
// followed by a real button/link (built from the caller's own absolute URL,
// e.g. opsDashboardUrl()) instead of a raw address printed as text. Neither
// is required, so every existing caller that only passes actionRequired is
// unaffected.
// errorDetail: an optional internal diagnostic string (already truncated by
// the caller) rendered in its own labeled block, separate from the facts
// table — a stack/error message is prose to scan, not a short label/value
// pair, and mixing it into the table pushed everything else down.
function renderAdminAlert({ severity, headline, summary, facts = [], errorDetail, actionRequired, actionUrl, actionLabel, note }) {
  const sev = styleFor(severity);
  const visibleFacts = facts
    .map(({ label, value }) => ({ label, value: presentValue(value) }))
    .filter((f) => f.value !== null);

  const factsHtml = visibleFacts.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 4px;border-collapse:collapse;">
        ${visibleFacts
          .map(
            (f) => `<tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px;white-space:nowrap;vertical-align:top;">${escapeHtml(f.label)}</td>
          <td style="padding:6px 0 6px 12px;color:#0f172a;font-size:13px;font-weight:600;word-break:break-word;">${escapeHtml(f.value)}</td>
        </tr>`
          )
          .join('')}
      </table>`
    : '';

  const errorValue = presentValue(errorDetail);
  const errorHtml = errorValue
    ? `<div style="margin:16px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;">
        <div style="color:#64748b;font-size:11px;font-weight:700;margin-bottom:4px;">פרטי השגיאה</div>
        <div style="color:#334155;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${escapeHtml(errorValue)}</div>
      </div>`
    : '';

  const actionLinkHtml = actionUrl && actionLabel
    ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:10px;padding:8px 18px;background:${sev.color};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:12px;">${escapeHtml(actionLabel)}</a>`
    : '';

  const actionHtml = `<div style="margin:16px 0 0;padding:10px 12px;border-radius:8px;background:${sev.bg};border:1px solid ${sev.border};color:${sev.color};font-size:13px;line-height:1.6;">
      <p style="margin:0;">${actionRequired ? `<strong>נדרשת פעולה:</strong> ${escapeHtml(actionRequired)}` : '<strong>לא נדרשת פעולה מיידית</strong> — רשומה לצורכי מעקב.'}</p>
      ${actionLinkHtml}
    </div>`;

  const noteHtml = note
    ? `<p style="margin:14px 0 0;color:#94a3b8;font-size:11px;line-height:1.6;">${escapeHtml(note)}</p>`
    : '';

  const html = wrapHtml(`
    <div style="display:inline-block;padding:3px 10px;border-radius:999px;background:${sev.bg};border:1px solid ${sev.border};color:${sev.color};font-size:11px;font-weight:700;">${sev.label}</div>
    <h2 style="margin:12px 0 8px;color:#0f172a;font-size:18px;">${escapeHtml(headline)}</h2>
    ${summary ? `<p style="margin:0;color:#475569;font-size:13px;line-height:1.7;">${escapeHtml(summary)}</p>` : ''}
    ${factsHtml}
    ${errorHtml}
    ${actionHtml}
    ${noteHtml}
  `);

  const text = [
    `[${sev.label}] ${headline}`,
    summary || null,
    visibleFacts.length ? visibleFacts.map((f) => `${f.label}: ${f.value}`).join('\n') : null,
    errorValue ? `פרטי השגיאה:\n${errorValue}` : null,
    actionRequired ? `נדרשת פעולה: ${actionRequired}` : 'לא נדרשת פעולה מיידית — רשומה לצורכי מעקב.',
    actionUrl && actionLabel ? `${actionLabel}: ${actionUrl}` : null,
    note || null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
}

// Link to the one operator screen that actually shows jobs/findings/webhooks
// (the Platform "תרומות" world — see hamonym-app app.routes.ts's own comment
// on why the route is /platform/donations while the component is still
// named cardcom-ops).
function opsDashboardUrl() {
  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  return `${frontBase}/platform/donations`;
}

module.exports = { renderAdminAlert, formatTimestamp, formatDuration, opsDashboardUrl, SEVERITY_STYLES };
