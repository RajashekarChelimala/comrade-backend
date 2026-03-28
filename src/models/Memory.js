import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    tags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

// Grouping by date for timeline view can be handled in aggregation or service layer
export const Memory = mongoose.model('Memory', memorySchema);
