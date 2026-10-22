import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { auth, admin } from '../middleware/auth.js';

const router = Router();

/*
  FILE UPLOAD — Cloudinary when configured, local disk otherwise
  ------------------------------------------------------------------
  Set CLOUDINARY_URL (format: cloudinary://key:secret@cloud_name —
  copy it straight from your Cloudinary dashboard) and uploads go
  straight to Cloudinary: CDN-served, auto-optimized, and survives
  every deploy.

  In production (NODE_ENV=production), Cloudinary is REQUIRED — local
  disk is refused outright rather than silently falling back, because
  Render's local disk is ephemeral (wiped on every redeploy) and was
  never meant to be permanent product-image storage. Local disk is
  still allowed in development so you can test without Cloudinary
  credentials on hand.

  SECURITY: extension-based filtering alone is not real validation —
  a file can be renamed to look like an image while containing
  anything. This checks the actual file signature (magic bytes) via
  file-type, and for images, decodes + re-encodes through Sharp before
  it goes anywhere — a file that isn't a genuine, decodable image
  simply won't survive that step, which extension/MIME spoofing can't
  fake.
*/

const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
const isProduction = process.env.NODE_ENV === 'production';

if (!useCloudinary && isProduction) {
  console.error('FATAL: CLOUDINARY_URL is not set. Cloudinary is required in production — local disk storage is not durable. Set CLOUDINARY_URL before deploying.');
}

if (useCloudinary) cloudinary.config(); // reads CLOUDINARY_URL automatically

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads');
if (!useCloudinary && !fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_DIMENSION = 6000; // px, either side

const upload = multer({
  storage: multer.memoryStorage(), // always buffer first — every file gets inspected before it touches disk or Cloudinary
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function uploadBufferToCloudinary(buffer, isVideo) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'the-off-grid', resource_type: isVideo ? 'video' : 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// POST /api/upload — admin only, single file field named "file"
router.post('/', auth, admin, (req, res) => {
  if (!useCloudinary && isProduction) {
    return res.status(503).json({ message: 'File uploads are not configured for production yet — CLOUDINARY_URL is missing.' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    try {
      // Real file-signature check — not just trusting the extension
      // or the browser-supplied Content-Type, which are both
      // trivially spoofable.
      const detected = await fileTypeFromBuffer(req.file.buffer);
      if (!detected) {
        return res.status(400).json({ message: 'Could not verify file type' });
      }

      const isImage = ALLOWED_IMAGE_MIME.has(detected.mime);
      const isVideo = ALLOWED_VIDEO_MIME.has(detected.mime);
      if (!isImage && !isVideo) {
        return res.status(400).json({ message: `File type ${detected.mime} is not allowed` });
      }

      let finalBuffer = req.file.buffer;

      if (isImage) {
        // Decode + re-encode through Sharp. A file that merely LOOKS
        // like an image (spoofed header, corrupted, polyglot) won't
        // survive this — it'll throw and get rejected below, rather
        // than being passed through to storage untouched.
        const image = sharp(req.file.buffer, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION });
        const metadata = await image.metadata();
        if ((metadata.width || 0) > MAX_IMAGE_DIMENSION || (metadata.height || 0) > MAX_IMAGE_DIMENSION) {
          return res.status(400).json({ message: `Image dimensions too large (max ${MAX_IMAGE_DIMENSION}px)` });
        }
        finalBuffer = await image
          .rotate() // normalize EXIF orientation
          .toFormat(detected.mime === 'image/png' ? 'png' : detected.mime === 'image/gif' ? 'gif' : 'jpeg', { quality: 88 })
          .toBuffer();
      }
      // Videos: signature-checked above; full codec/duration validation
      // needs a dedicated media pipeline (ffprobe) which is a heavier
      // addition — size cap (20MB) and container/MIME check cover the
      // common cases for now.

      if (useCloudinary) {
        const result = await uploadBufferToCloudinary(finalBuffer, isVideo);
        return res.status(201).json({ url: result.secure_url, filename: result.public_id, storage: 'cloudinary' });
      }

      const ext = detected.ext;
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, filename), finalBuffer);
      const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      res.status(201).json({ url: `${base}/uploads/${filename}`, filename, storage: 'local' });
    } catch (e) {
      console.error('UPLOAD VALIDATION/PROCESSING ERROR:', e.message);
      res.status(400).json({ message: 'This file could not be processed — it may be corrupted or not a genuine image/video.' });
    }
  });
});

export default router;
