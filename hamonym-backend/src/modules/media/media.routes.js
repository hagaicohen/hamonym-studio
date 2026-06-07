const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const supabase = require('../../lib/supabase');
const requireAuth = require('../../middleware/require-auth');

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    try {
      const file   = req.file;
      const folder = req.body.folder || 'general';

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const ext      = file.originalname.split('.').pop();
      const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error } = await supabase.storage
        .from('media')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) throw error;

      const { data } = supabase.storage.from('media').getPublicUrl(filePath);

      res.json({ url: data.publicUrl });

    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

module.exports = router;
