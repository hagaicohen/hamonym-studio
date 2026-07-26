// Test harness for BriefBuilder — Sprint 2's acceptance gate: does a good
// Brief come out of ExtractedFacts alone? Runs every fixture in
// src/agents/campaign-creation/fixtures-brief/ (ExtractedFacts JSON, not raw
// text — this validates the Facts→Brief contract in isolation, see
// campaign-creation.pipeline.js's buildBriefFromFacts), prints each result,
// and writes it to scripts/output/campaign-creation-brief/ for regression
// diffing across prompt changes, same pattern as Sprint 1's harness.
//
// Usage: node scripts/test-campaign-creation-brief.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildBriefFromFacts } = require('../src/agents/campaign-creation/campaign-creation.pipeline');

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'agents', 'campaign-creation', 'fixtures-brief');
const OUTPUT_DIR = path.join(__dirname, 'output', 'campaign-creation-brief');

async function main() {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.error(`No fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let failures = 0;
  for (const file of files) {
    const facts = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    console.log(`\n=== ${file} ===`);
    try {
      const result = await buildBriefFromFacts(facts);
      console.log(JSON.stringify(result, null, 2));
      fs.writeFileSync(
        path.join(OUTPUT_DIR, file),
        JSON.stringify(result, null, 2),
        'utf8'
      );
    } catch (err) {
      failures += 1;
      console.error(`FAILED: ${err.message}`);
    }
  }

  console.log(`\n${files.length - failures}/${files.length} fixtures processed. Output written to ${OUTPUT_DIR}`);
  process.exit(failures ? 1 : 0);
}

main();
