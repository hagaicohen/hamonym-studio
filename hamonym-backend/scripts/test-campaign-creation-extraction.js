// Test harness for the FreeTextExtractor — not a Postman/HTTP check, this is
// the acceptance gate from AI_CAMPAIGN_CREATION_MVP.md: is ExtractedFacts
// good enough from free text that a Brief could be built on top of it
// without changing the Extractor? Runs every fixture in
// src/agents/campaign-creation/fixtures/, prints each result, and writes it
// to scripts/output/campaign-creation/ so prompt changes can be diffed
// against previous runs (a "golden corpus" over time) instead of judged by
// feel.
//
// Usage: node scripts/test-campaign-creation-extraction.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractFromFreeText } = require('../src/agents/campaign-creation/campaign-creation.pipeline');

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'agents', 'campaign-creation', 'fixtures');
const OUTPUT_DIR = path.join(__dirname, 'output', 'campaign-creation');

async function main() {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.txt'));
  if (!files.length) {
    console.error(`No fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let failures = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
    console.log(`\n=== ${file} ===`);
    try {
      const result = await extractFromFreeText(text);
      console.log(JSON.stringify(result, null, 2));
      fs.writeFileSync(
        path.join(OUTPUT_DIR, file.replace(/\.txt$/, '.json')),
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
