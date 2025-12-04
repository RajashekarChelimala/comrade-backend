import cron from 'node-cron';
import { getCloudinary } from '../config/cloudinary.js';
import { Message } from '../models/Message.js';

export function scheduleMediaCleanupJob() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    try {
      const candidates = await Message.find({
        type: 'media',
        isSaved: false,
        expiresAt: { $lt: now },
        isDeleted: { $ne: true },
      }).limit(100);

      if (!candidates.length) return;

      const cloudinary = getCloudinary();

      // eslint-disable-next-line no-restricted-syntax
      for (const msg of candidates) {
        try {
          if (msg.mediaPublicId) {
            // eslint-disable-next-line no-await-in-loop
            await cloudinary.uploader.destroy(msg.mediaPublicId, {
              resource_type: msg.mediaType === 'video' ? 'video' : 'image',
            });
          }

          msg.isDeleted = true;
          msg.mediaUrl = null;
          msg.mediaPublicId = null;
          // eslint-disable-next-line no-await-in-loop
          await msg.save();
        } catch (err) {
          // continue with next message
        }
      }
    } catch (err) {
      // ignore errors in scheduled job for now
    }
  });
}
