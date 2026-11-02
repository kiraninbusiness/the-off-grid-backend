import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { pool } from '../db.js';

const router = Router();
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

function extractModelText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('\n').trim();
}

router.post('/', (req, res) => {
  receive.single('file')(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ message: uploadError.message || 'Image upload failed' });
    if (!req.file) return res.status(400).json({ message: 'Choose a product or outfit image first' });
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: 'Visual search is not configured yet. Add GEMINI_API_KEY to the backend environment.' });

    try {
      const detected = await fileTypeFromBuffer(req.file.buffer);
      if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
        return res.status(400).json({ message: 'Upload a JPEG, PNG or WebP image' });
      }
      const image = await sharp(req.file.buffer, { limitInputPixels: 36_000_000 })
        .rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toBuffer();
      const prompt = 'You are a fashion catalogue visual-search assistant. Inspect the uploaded clothing/product photo and return ONLY compact JSON with keys search_query, category, color, garment, style. search_query must be a short 3-8 word description useful for finding similar apparel in an online catalogue. Do not identify people or infer personal attributes. If no apparel/product is visible, set search_query to an empty string.';
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: image.toString('base64') } }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 160 }
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        const details = await response.text();
        console.error('Visual search provider error:', response.status, details.slice(0, 500));
        return res.status(502).json({ message: 'Visual search is temporarily unavailable. Please try again.' });
      }
      const provider = await response.json();
      let parsed;
      try { parsed = JSON.parse(extractModelText(provider)); }
      catch { return res.status(502).json({ message: 'Could not understand this image. Try another clear product photo.' }); }
      const query = String(parsed.search_query || '').trim().slice(0, 120);
      if (!query) return res.status(422).json({ message: 'No clothing or product was detected in this image.' });

      const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2))].slice(0, 8);
      if (!terms.length) return res.status(422).json({ message: 'Could not identify useful clothing details. Try a clearer product photo.' });
      const clauses = [];
      const values = [];
      for (const term of terms) {
        values.push('%' + term + '%');
        const n = values.length;
        clauses.push(`(p.name ILIKE $${n} OR p.description ILIKE $${n} OR p.category ILIKE $${n} OR COALESCE(p.color,'') ILIKE $${n} OR COALESCE(p.fit,'') ILIKE $${n})`);
      }
      const sql = `
        SELECT p.*,
          COALESCE((SELECT json_agg(v ORDER BY v.size, v.color) FROM product_variants v WHERE v.product_id = p.id), '[]') AS variants
        FROM products p
        WHERE p.stock > 0 AND (${clauses.join(' OR ')})
        ORDER BY p.created_at DESC
        LIMIT 30
      `;
      const { rows } = await pool.query(sql, values);
      return res.json({ query, visual_description: parsed, items: rows, count: rows.length });
    } catch (error) {
      console.error('POST /visual-search failed:', error.message);
      return res.status(500).json({ message: 'Visual search failed. Please try another image.' });
    }
  });
});

export default router;
