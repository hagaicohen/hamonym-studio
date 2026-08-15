const db = require('../../../db/db');
const jobRunner = require('../../../jobs');

// Read-only + "repair local state" actions only — see
// docs/CARDCOM_OPERATIONAL_PROCESSES.md Part G. Every job reachable through
// run() here is detect-only or re-processes Hamonym's own already-received
// data (webhook-recovery); none of them call a Cardcom endpoint that
// creates or changes a charge. That boundary is enforced by what's
// registered in src/jobs/index.js, not by a check in this controller — do
// not register a financial-action job there without updating this comment
// and getting explicit product sign-off first.

exports.getHealth = async (req, res) => {
  try {
    const lastWebhooks = await db.query(
      `SELECT COALESCE(record_type, 'LowProfile') AS type, MAX(received_at) AS last_received_at, COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours') AS count_24h
       FROM cardcom_webhook_events
       GROUP BY COALESCE(record_type, 'LowProfile')`
    );
    const lastJobRuns = await db.query(
      `SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at, duration_ms, error
       FROM job_runs ORDER BY job_name, started_at DESC`
    );
    res.json({
      webhooks: lastWebhooks.rows,
      jobs: lastJobRuns.rows,
      knownJobs: jobRunner.list(),
    });
  } catch (err) {
    console.error('[cardcom-ops.getHealth]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getJobRuns = async (req, res) => {
  try {
    const { jobName } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
    const params = jobName ? [jobName, limit] : [limit];
    const where = jobName ? 'WHERE job_name = $1' : '';
    const runs = await db.query(
      `SELECT id, job_name, status, started_at, finished_at, duration_ms, result_summary, error, triggered_by
       FROM job_runs ${where} ORDER BY started_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ runs: runs.rows });
  } catch (err) {
    console.error('[cardcom-ops.getJobRuns]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.runJob = async (req, res) => {
  try {
    const { name } = req.params;
    if (!jobRunner.list().includes(name)) {
      return res.status(404).json({ error: `Unknown job: ${name}` });
    }
    const result = await jobRunner.run(name, { triggeredBy: `admin:${req.user.id}` });
    res.json(result);
  } catch (err) {
    console.error('[cardcom-ops.runJob]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getFindings = async (req, res) => {
  try {
    const includeResolved = req.query.includeResolved === 'true';
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const findings = await db.query(
      `SELECT id, job_name, finding_type, severity, subject_type, subject_id, details, found_at, resolved_at, resolved_by
       FROM reconciliation_findings
       ${includeResolved ? '' : 'WHERE resolved_at IS NULL'}
       ORDER BY found_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ findings: findings.rows });
  } catch (err) {
    console.error('[cardcom-ops.getFindings]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Bookkeeping only — marks a finding as looked-at/handled. Never touches
// donations/campaigns/recurring_instructions itself.
exports.resolveFinding = async (req, res) => {
  try {
    await db.query(
      `UPDATE reconciliation_findings SET resolved_at=NOW(), resolved_by=$1 WHERE id=$2`,
      [`admin:${req.user.id}`, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[cardcom-ops.resolveFinding]', err.message);
    res.status(500).json({ error: err.message });
  }
};
