import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, trim: true, required: true },
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

    type: { type: String, enum: ['text', 'media', 'poll', 'game', 'announcement', 'voice'], required: true },
    encryptedContent: { type: String },

    // Optional reference to another message when this is a reply
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

    mediaUrl: { type: String },
    mediaType: { type: String }, // Removed enum restriction to allow raw/document files
    mediaPublicId: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    isSaved: { type: Boolean, default: false },
    expiresAt: { type: Date },
    isDeleted: { type: Boolean, default: false },

    pollData: {
      question: { type: String },
      options: [
        {
          text: { type: String },
          votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        },
      ],
      expiresAt: { type: Date },
    },

    gameData: {
      gameType: { type: String },
      state: { type: Map, of: String },
    },

    isScheduled: { type: Boolean, default: false },
    scheduledFor: { type: Date },
    isSurprise: { type: Boolean, default: false },
    unlockAt: { type: Date },

    editHistory: [
      {
        content: { type: String },
        editedAt: { type: Date, default: Date.now },
      },
    ],

    reactions: [reactionSchema],
    readBy: [readBySchema],
  },
  { timestamps: true },
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { isSaved: false, expiresAt: { $exists: true } } });

export const Message = mongoose.model('Message', messageSchema);
