// Whitelist re-projection for Target Resolver output — never trusts the raw
// LLM JSON as-is. Same boundary discipline as
// campaign-creation/extractors/free-text.extractor.js's project() and
// brief.builder.js's sanitizeGalleryCuration(): rebuild a fresh, narrow
// shape from known-good inputs rather than passing the model's output
// through. This is the single most important function in the feature —
// it's what makes a hallucinated/spoofed sourceId or an out-of-enum target
// structurally impossible to act on, regardless of what the model returns.
//
// Also does the sourceId -> verbatim value lookup (decision: no separate
// /resolve endpoint — this happens once, here, right after the LLM call).

// @param {object} raw - parsed LLM JSON, untrusted
// @param {import('./partner-import.types').NormalizedBlock[]} blocks - the exact blocks sent to the model
// @param {string[]} legalTargets - this pass's allowed target enum
// @returns {import('./partner-import.types').ResolvedEntry[]}
exports.validateAndResolve = (raw, blocks, legalTargets) => {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const legal = new Set(legalTargets);
  const rawEntries = Array.isArray(raw?.entries) ? raw.entries : [];

  const resolved = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry.sourceId !== 'string') continue;

    const block = byId.get(entry.sourceId);
    if (!block) continue; // unknown/hallucinated sourceId — dropped, never reaches the mapper

    if (typeof entry.target !== 'string' || !legal.has(entry.target)) continue; // out-of-enum target — dropped

    const confidence = typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
      ? Math.max(0, Math.min(1, entry.confidence))
      : null;
    if (confidence === null) continue;

    const value = block.type === 'image' ? block.src : block.text;
    if (!value) continue; // nothing real to resolve to

    resolved.push({ sourceId: entry.sourceId, target: entry.target, confidence, value, sourceType: block.type });
  }
  return resolved;
};
