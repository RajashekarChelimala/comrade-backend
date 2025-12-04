import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['like', 'dislike', 'love', 'laugh', 'sad', 'angry'],
      required: true,
    },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const readBySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: ['text', 'media'], required: true },
    encryptedContent: { type: String },

    // Optional reference to another message when this is a reply
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

    mediaUrl: { type: String },
    mediaType: { type: String, enum: ['image', 'video'] },
    mediaPublicId: { type: String },
    isSaved: { type: Boolean, default: false },
    expiresAt: { type: Date },
    isDeleted: { type: Boolean, default: false },

    reactions: [reactionSchema],
    readBy: [readBySchema],
  },
  { timestamps: true },
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { isSaved: false, expiresAt: { $exists: true } } });

export const Message = mongoose.model('Message', messageSchema);
