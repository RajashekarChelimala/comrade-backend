import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    searchableByEmail: { type: Boolean, default: true },
    showLastSeen: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    comradeHandle: { type: String, required: true, unique: true, index: true },
    comradeId: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: {
      type: String,
      enum: ['active', 'blocked_due_to_reports', 'blocked_manual', 'deleted'],
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
  },
  { timestamps: true },
);

userSchema.index({ name: 'text', comradeHandle: 'text' });

export const User = mongoose.model('User', userSchema);
