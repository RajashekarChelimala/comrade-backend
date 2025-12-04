import mongoose from 'mongoose';

const unblockRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    explanation: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    adminComment: { type: String },
  },
  { timestamps: true },
);

unblockRequestSchema.index({ user: 1, status: 1 });

export const UnblockRequest = mongoose.model('UnblockRequest', unblockRequestSchema);
