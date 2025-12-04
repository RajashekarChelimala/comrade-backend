import multer from 'multer';
import { getCloudinary } from '../config/cloudinary.js';

const upload = multer({ storage: multer.memoryStorage() });

export const uploadMiddleware = upload.single('file');

export async function uploadMedia(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  const cloudinary = getCloudinary();

  const isImage = req.file.mimetype.startsWith('image/');
  const isVideo = req.file.mimetype.startsWith('video/');

  if (!isImage && !isVideo) {
    return res.status(400).json({ message: 'Only image and video files are allowed' });
  }

  const resourceType = isImage ? 'image' : 'video';

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType },
        (error, uploaded) => {
          if (error) return reject(error);
          return resolve(uploaded);
        },
      );

      stream.end(req.file.buffer);
    });

    return res.status(201).json({
      mediaUrl: result.secure_url,
      mediaType: resourceType,
      mediaPublicId: result.public_id,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to upload media' });
  }
}
