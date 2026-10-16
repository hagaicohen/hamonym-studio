// FIN-11 deploy-order compatibility probe (2026-10-16).
//
// Why this file exists: collection.service.js#openAttempt and
// masav-collection.service.js#openMasavAttempt are EXISTING, live
// production collection paths (they predate FIN-11 Stage 2B/3 entirely).
// Stage 2B/3 added defensive guard calls to them -- hasOpenCollectionHold,
// hasExportedMasavProposal, hasActiveMasavProposal -- that query
// payment_exceptions / masav_collection_proposals (migrations 073/074).
// Render auto-deploys this backend from `main` on every commit, so code
// can reach production before those migrations are applied there. Without
// a guard, that unconditional query throws (relation does not exist) and
// the EXISTING collection path fails outright -- not just "new FIN-11
// behavior is unavailable", but "no collection, old or new, works at all".
//
// This probe is deliberately narrow and explicit (not a generic
// try/catch-and-ignore around the guard calls): it checks presence of
// exactly the two relations those specific guards depend on, via
// to_regclass -- a catalog lookup, no table scan, no lock, cheap enough to
// call every time with no cache (so there is nothing here that can go
// stale, and a real unrelated DB error -- connection loss, permissions, a
// different missing table -- still propagates normally from the actual
// guard call sites, never swallowed here).
//
// Call sites MUST pass the same `client`/transaction they will use for the
// guarded query, so the presence check and the query it gates see the
// identical, consistent snapshot.
const pool = require('../../db/db');

async function isPaymentExceptionsSchemaPresent(client = pool) {
  const res = await client.query(`SELECT to_regclass('public.payment_exceptions') AS t`);
  return res.rows[0].t !== null;
}

async function isMasavProposalsSchemaPresent(client = pool) {
  const res = await client.query(`SELECT to_regclass('public.masav_collection_proposals') AS t`);
  return res.rows[0].t !== null;
}

module.exports = {
  isPaymentExceptionsSchemaPresent,
  isMasavProposalsSchemaPresent,
};
