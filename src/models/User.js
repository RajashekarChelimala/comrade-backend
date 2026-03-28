import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    searchableByEmail: { type: Boolean, default: true },
    isSearchable: { type: Boolean, default: true },
    showLastSeen: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // comradeHandle removed in favor of comradeId
    comradeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      minLength: 3,
      maxLength: 30
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: {
      type: String,
      enum: ['active', 'blocked_due_to_reports', 'blocked_manual', 'deleted', 'pending_approval'],
      default: 'active',
    },
    deletedAt: { type: Date },

    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    reportedByCount: { type: Number, default: 0 },

    settings: { type: settingsSchema, default: () => ({}) },

    lastSeenAt: { type: Date },
    isOnline: { type: Boolean, default: false },

    emailVerified: { type: Boolean, default: false },
    emailVerificationCode: { type: String },
    emailVerificationExpiresAt: { type: Date },

    mood: {
      type: String,
      enum: ['happy', 'sad', 'busy', 'tired', 'excited', 'neutral'],
      default: 'neutral'
    },
    customStatus: { type: String, trim: true, maxLength: 100 },
    sessions: [
      {
        device: { type: String },
        lastActive: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

userSchema.index({ name: 'text', comradeId: 'text' });

export const User = mongoose.model('User', userSchema);
