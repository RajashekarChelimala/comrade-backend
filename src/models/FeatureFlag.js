import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        enabled: { type: Boolean, default: true },
        description: { type: String },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

export const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
