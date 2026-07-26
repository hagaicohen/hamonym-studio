// DocumentCollectionExtractor — turns a combined submission (free text +/or
// a website URL +/or uploaded files, each tagged with a type by the user:
// לוגו/תעודת התאגדות/דוח שנתי/etc.) into ExtractedFacts. Same principle as
// the "Document Collection" design note in AI_CAMPAIGN_CREATION_VISION.md,
// now generalized to the full combined-intake screen: this is an adapter,
// not a second pipeline — ONE Extraction call over aggregated content,
// never per-source extraction + a merge stage (that's the rejected Facts
// Merger idea — still avoided, because there's nothing separate to merge;
// everything becomes text/images in one prompt before the single LLM call
// happens). A website fetch that fails doesn't fail the whole request —
// it's noted and the rest of the submission (files/text) still goes
// through, same "partial success" philosophy as website.extractor.js's own
// failure handling.
//
// Per-file content normalization:
//   - image/* -> passed to the LLM directly as vision input (base64 data
//     URL) — covers logos, activity photos, AND scanned/photographed
//     documents *if uploaded as image files*.
//   - application/pdf -> text layer extracted via pdf-parse. A PDF whose
//     pages are scanned images (no text layer) has no extractable text —
//     flagged honestly as unsupported rather than silently producing
//     nothing; re-uploading as an image works instead (goes through the
//     vision path above).
//   - .docx -> plain text via mammoth.
//   - anything else -> flagged as unsupported, not silently dropped.
//
// All text (from PDFs/docx/free text) is concatenated into ONE block.
// If any images are present, the call becomes multi-modal (content array);
// otherwise this reduces to a plain FreeTextExtractor call — full reuse of
// its LLM-call + whitelist-projection logic via runExtraction(), not
// duplicated here.

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const freeTextExtractor = require('./free-text.extractor');
const websiteExtractor = require('./website.extractor');

const MIN_CONTENT_LENGTH = 10; // same spirit as free-text.extractor.js's own gate
const SCANNED_PDF_NOTE = '[קובץ PDF זה נראה סרוק (אין בו טקסט לחילוץ) — סוג זה עדיין לא נתמך. אפשר להעלות אותו כתמונה (צילום/סריקה) במקום.]';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function fileToTextBlock(file) {
  const label = `[קובץ: ${file.typeLabel}${file.note ? ' — ' + file.note : ''}]`;

  if (file.mimeType === 'application/pdf') {
    let text = '';
    try {
      const parsed = await pdfParse(file.buffer);
      text = (parsed.text || '').trim();
    } catch {
      text = '';
    }
    return `${label}\n${text.length >= MIN_CONTENT_LENGTH ? text : SCANNED_PDF_NOTE}`;
  }

  if (file.mimeType === WORD_MIME) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const text = (result.value || '').trim();
      return `${label}\n${text.length >= MIN_CONTENT_LENGTH ? text : '[המסמך ריק או לא הכיל טקסט קריא]'}`;
    } catch {
      return `${label}\n[לא הצלחנו לקרוא את הקובץ]`;
    }
  }

  return `${label}\n[סוג קובץ לא נתמך: ${file.mimeType}]`;
}

// @param {Array<{ buffer: Buffer, mimeType: string, typeLabel: string, note?: string }>} files
// @param {string} [freeText] - optional accompanying free text from the same submission
// @param {string} [websiteUrl] - optional accompanying website URL from the same submission
// @returns {Promise<import('../campaign-creation.types').ExtractedFacts>}
exports.extract = async (files, freeText, websiteUrl) => {
  const textBlocks = [];
  if (freeText && freeText.trim()) {
    textBlocks.push(`טקסט חופשי מהמשתמש:\n${freeText.trim()}`);
  }

  if (websiteUrl && websiteUrl.trim()) {
    try {
      const siteText = await websiteExtractor.fetchMainContent(websiteUrl.trim());
      textBlocks.push(`[תוכן מהאתר ${websiteUrl.trim()}]\n${siteText}`);
    } catch {
      // Doesn't fail the whole request — whatever else was provided
      // (files/text) still goes through. The note tells the model (and via
      // sourceRaw, eventually a human reviewing the Brief) that this piece
      // didn't come through, rather than silently pretending it wasn't asked for.
      textBlocks.push(`[לא הצלחנו לגשת לאתר שסופק: ${websiteUrl.trim()}]`);
    }
  }

  const imageFiles = files.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = files.filter((f) => !f.mimeType.startsWith('image/'));

  for (const file of otherFiles) {
    textBlocks.push(await fileToTextBlock(file));
  }
  for (const file of imageFiles) {
    textBlocks.push(`[תמונה מצורפת: ${file.typeLabel}${file.note ? ' — ' + file.note : ''}]`);
  }

  const combinedText = textBlocks.join('\n\n');
  const sourceRaw = combinedText || '(רק תמונות, ללא טקסט נלווה)';

  if (!imageFiles.length) {
    // Pure text/document collection — full reuse of FreeTextExtractor,
    // including its own MIN_TEXT_LENGTH gate. Override source: extract()
    // hardcodes 'free_text' internally, which is wrong for this caller —
    // same pattern website.extractor.js uses.
    const facts = await freeTextExtractor.extract(combinedText);
    return { ...facts, source: 'combined' };
  }

  // Multi-modal: at least one image present, build a content-parts array
  // instead of a plain string. llm.service.js's complete() already forwards
  // whatever it's given straight into the message content — no changes
  // needed there.
  const userPromptContent = [
    { type: 'text', text: combinedText || 'ראה תמונות מצורפות.' },
    ...imageFiles.map((f) => ({
      type: 'image_url',
      image_url: { url: `data:${f.mimeType};base64,${f.buffer.toString('base64')}` },
    })),
  ];

  const facts = await freeTextExtractor.runExtraction(sourceRaw, userPromptContent);
  return { ...facts, source: 'combined' };
};
