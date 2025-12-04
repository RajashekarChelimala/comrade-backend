import mongoose from 'mongoose';

const encryptionSchema = new mongoose.Schema(
  {
    chatKeyId: { type: String, required: true },
    encryptedChatKey: { type: String, required: true },
    algorithm: { type: String, default: 'aes-256-gcm' },
  },
  { _id: false },
);

const unreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const chatSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    encryption: { type: encryptionSchema, required: true },

    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    unreadCounts: [unreadSchema],
  },
  { timestamps: true },
);

chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

export const Chat = mongoose.model('Chat', chatSchema);
