// Test harness for WebsiteExtractor's normalization step — MVP §10's
// deterministic fixture strategy: local HTML files, NOT a live fetch (live
// content isn't reproducible). Exercises extractMainContent() +
// FreeTextExtractor directly, skipping fetchHtml()/assertSafeUrl() entirely
// — those are network-layer concerns covered separately by manual smoke
// tests against real sites, not by this automated corpus.
//
// Usage: node scripts/test-campaign-creation-website.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const websiteExtractor = require('../src/agents/campaign-creation/extractors/website.extractor');
const freeTextExtractor = require('../src/agents/campaign-creation/extractors/free-text.extractor');

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'agents', 'campaign-creation', 'fixtures-website');
const OUTPUT_DIR = path.join(__dirname, 'output', 'campaign-creation-website');

async function main() {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.html'));
  if (!files.length) {
    console.error(`No fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let failures = 0;
  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
    console.log(`\n=== ${file} ===`);
    try {
      const mainContent = websiteExtractor.extractMainContent(html, 'https://example.org');
      console.log(`normalized content length: ${mainContent.length}`);

      const facts = await freeTextExtractor.extract(mainContent);
      const result = { ...facts, source: 'website' };
      console.log(JSON.stringify(result, null, 2));

      fs.writeFileSync(
        path.join(OUTPUT_DIR, file.replace(/\.html$/, '.json')),
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
