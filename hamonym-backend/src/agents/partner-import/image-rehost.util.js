// Fetches a source image and re-hosts it in our own Supabase 'media' bucket
// — same bucket/pattern as media.routes.js's POST /upload, called directly
// here (no HTTP round-trip, no multipart) since this runs server-side
// during a clone, not from a browser file input. Never throws — a failed
// image is skipped by the caller, not a reason to fail the whole clone.

const supabase = require('../../lib/supabase');

exports.rehostImage = async (srcUrl) => {
  try {
    const res = await fetch(srcUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = (srcUrl.split('.').pop().split('?')[0] || 'jpg').slice(0, 5);
    const filePath = `partners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage.from('media').upload(filePath, buf, {
      contentType, upsert: false,
    });
    if (error) return null;

    const { data } = supabase.storage.from('media').getPublicUrl(filePath);
    return data.publicUrl;
  } catch {
    return null;
  }
};
