import { User } from '../models/User.js';
import { FeatureFlag } from '../models/FeatureFlag.js';
import { Report } from '../models/Report.js';
import { UnblockRequest } from '../models/UnblockRequest.js';
import { refreshFeatureFlags } from '../config/featureFlags.js';
import bcrypt from 'bcryptjs';

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

export async function getPendingUsers(req, res) {
  const users = await User.find({ status: 'pending_approval' })
    .select('name email comradeId createdAt status')
    .sort({ createdAt: -1 });
  return res.json({ users });
}

export async function approveUser(req, res) {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  
  if (user.status !== 'pending_approval') {
    return res.status(400).json({ message: 'User is not pending approval' });
  }

  user.status = 'active';
  await user.save();
  return res.json({ message: 'User approved successfully' });
}

export async function rejectUser(req, res) {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  
  if (user.status !== 'pending_approval') {
    return res.status(400).json({ message: 'User is not pending approval' });
  }

  await User.findByIdAndDelete(id);
  return res.json({ message: 'User registration rejected and deleted' });
}

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

export async function deleteUser(req, res) {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ message: 'Cannot delete admin users' });

  await User.findByIdAndDelete(id);
  return res.json({ message: 'User deleted successfully' });
}

export async function createUser(req, res) {
  const { name, email, comradeId, password, role } = req.body;

  if (!name || !email || !comradeId || !password) {
    return res.status(400).json({ message: 'name, email, comradeId, and password are required' });
  }

  const existing = await User.findOne({ $or: [{ email }, { comradeId }] });
  if (existing) {
    return res.status(409).json({ message: 'A user with that email or comradeId already exists' });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const newUser = await User.create({
    name,
    email,
    comradeId,
    passwordHash,
    role: role || 'user',
    emailVerified: true,
    status: 'active',
    settings: { isSearchable: true, searchableByEmail: true, showLastSeen: true },
  });

  return res.status(201).json({
    message: 'User created successfully',
    user: { _id: newUser._id, name: newUser.name, email: newUser.email, comradeId: newUser.comradeId, role: newUser.role, status: newUser.status },
  });
}
