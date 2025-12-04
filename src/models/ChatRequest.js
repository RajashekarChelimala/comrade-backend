import mongoose from 'mongoose';

const chatRequestSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING',
    },
    declineCount: { type: Number, default: 0 },
    lastActionAt: { type: Date },
  },
  { timestamps: true },
);

chatRequestSchema.index({ sender: 1, recipient: 1 }, { unique: true });
chatRequestSchema.index({ recipient: 1, status: 1 });
chatRequestSchema.index({ sender: 1, status: 1 });

export const ChatRequest = mongoose.model('ChatRequest', chatRequestSchema);
