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
  const isAudio = req.file.mimetype.startsWith('audio/');
  
  // Changing to 'auto' to bypass 401 delivery restrictions on raw files
  const resourceType = 'auto';

  let mediaType = 'file';
  if (isImage) mediaType = 'image';
  else if (isVideo) mediaType = 'video';
  else if (isAudio) mediaType = 'audio';
  else if (req.file.mimetype.includes('pdf')) mediaType = 'pdf';
  else if (req.file.mimetype.includes('document')) mediaType = 'document';

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { 
          resource_type: resourceType,
          use_filename: true,
          filename_override: req.file.originalname
        },
        (error, uploaded) => {
          if (error) return reject(error);
          return resolve(uploaded);
        },
      );

      stream.end(req.file.buffer);
    });

    return res.status(201).json({
      mediaUrl: result.secure_url,
      mediaType: mediaType,
      mediaPublicId: result.public_id,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to upload media' });
  }
}
