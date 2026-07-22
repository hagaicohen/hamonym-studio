// Test harness for the Brief -> Draft mapper (Sprint 3). No LLM, no
// OPENAI_API_KEY needed — this is deterministic mapping, so the interesting
// output is which fields DID map cleanly and which show up under
// `unmapped`, not prompt-quality. Runs every fixture in
// src/agents/campaign-creation/fixtures-draft/ (Brief JSON, stripped of
// the pipeline's `trace` wrapper — mirrors Sprint 2's fixtures-brief/
// pattern one stage further down the pipeline).
//
// Usage: node scripts/test-campaign-creation-draft.js

const fs = require('fs');
const path = require('path');
const { mapBriefToDraftPatches } = require('../src/agents/campaign-creation/campaign-creation.pipeline');

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'agents', 'campaign-creation', 'fixtures-draft');
const OUTPUT_DIR = path.join(__dirname, 'output', 'campaign-creation-draft');

function main() {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.error(`No fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const file of files) {
    const brief = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    console.log(`\n=== ${file} ===`);
    const result = mapBriefToDraftPatches(brief);
    console.log(JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, file), JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(`\n${files.length}/${files.length} fixtures mapped. Output written to ${OUTPUT_DIR}`);
}

main();
