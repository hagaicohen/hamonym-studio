const express =
  require('express');

const multer =
  require('multer');

const router =
  express.Router();

const controller =
  require('./campaign-creation.controller');

const requireAuth =
  require('../../middleware/require-auth');

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Limits exist because every uploaded file eventually becomes LLM input
// (text extracted, or base64-encoded straight into the request for images)
// — an unbounded upload is a direct cost/abuse vector here, not just a
// storage concern.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});

router.post(
  '/extract',
  requireAuth,
  controller.extractAndBuildBrief
);

router.post(
  '/extract-documents',
  requireAuth,
  upload.array('files', 6),
  controller.extractFromDocuments
);

router.post(
  '/map-to-draft',
  requireAuth,
  controller.mapToDraft
);

module.exports =
  router;
