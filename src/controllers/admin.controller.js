import { User } from '../models/User.js';
import { FeatureFlag } from '../models/FeatureFlag.js';
import { Report } from '../models/Report.js';
import { UnblockRequest } from '../models/UnblockRequest.js';
import { refreshFeatureFlags } from '../config/featureFlags.js';

export async function getAllUsers(req, res) {
  const users = await User.find()
    .select('name email comradeId role status isOnline lastSeenAt createdAt')
    .sort({ createdAt: -1 });
  return res.json({ users });
}

export async function getFlags(req, res) {
  const flags = await FeatureFlag.find();
  return res.json({ flags });
}

export async function updateFlag(req, res) {
  const { key } = req.params;
  const { enabled, description } = req.body;

  const flag = await FeatureFlag.findOneAndUpdate(
    { key },
    { enabled, description, updatedBy: req.user.id },
    { new: true, upsert: true }
  );

  await refreshFeatureFlags();
  return res.json({ flag });
}

// Missing functions required by admin.routes.js

export async function getReportedUsers(req, res) {
  // Find users who have reports
  const users = await User.find({ 'reportedByCount': { $gt: 0 } })
    .select('name comradeId reportedByCount status')
    .sort({ reportedByCount: -1 });

  return res.json({ users });
}

export async function getUnblockRequests(req, res) {
  const requests = await UnblockRequest.find({ status: 'pending' })
    .populate('user', 'name comradeId email status')
    .sort({ createdAt: 1 });
  return res.json({ requests });
}

export async function approveUnblockRequest(req, res) {
  const { id } = req.params;
  const request = await UnblockRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  request.status = 'approved';
  request.resolvedBy = req.user.id;
  request.resolvedAt = new Date();
  await request.save();

  await User.findByIdAndUpdate(request.user, {
    status: 'active',
    $set: { blockedUsers: [] } // Optionally clear their blocked list or reset reports?
    // resetting status is main thing
  });

  // Reset report count?
  await User.findByIdAndUpdate(request.user, { reportedByCount: 0 });

  return res.json({ message: 'Request approved, user unblocked' });
}

export async function rejectUnblockRequest(req, res) {
  const { id } = req.params;
  const request = await UnblockRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  request.status = 'rejected';
  request.resolvedBy = req.user.id;
  request.resolvedAt = new Date();
  await request.save();

  return res.json({ message: 'Request rejected' });
}
