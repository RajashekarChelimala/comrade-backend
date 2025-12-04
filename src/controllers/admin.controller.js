import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { UnblockRequest } from '../models/UnblockRequest.js';

export async function getReportedUsers(req, res) {
  const reports = await Report.find({ status: 'open' })
    .populate('reportedUser', 'name comradeHandle comradeId status')
    .populate('reporter', 'name comradeHandle comradeId')
    .sort({ createdAt: -1 });

  return res.json({ reports });
}

export async function getUnblockRequests(req, res) {
  const requests = await UnblockRequest.find({ status: 'pending' })
    .populate('user', 'name comradeHandle comradeId status')
    .sort({ createdAt: -1 });

  return res.json({ requests });
}

export async function approveUnblockRequest(req, res) {
  const { id } = req.params;
  const request = await UnblockRequest.findById(id);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ message: 'Unblock request not found' });
  }

  const user = await User.findById(request.user);
  if (user) {
    user.status = 'active';
    await user.save();
  }

  request.status = 'approved';
  await request.save();

  return res.json({ message: 'User unblocked' });
}

export async function rejectUnblockRequest(req, res) {
  const { id } = req.params;
  const request = await UnblockRequest.findById(id);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ message: 'Unblock request not found' });
  }

  request.status = 'rejected';
  await request.save();

  return res.json({ message: 'Unblock request rejected' });
}
