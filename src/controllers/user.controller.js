import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { UnblockRequest } from '../models/UnblockRequest.js';

const REPORT_THRESHOLD = 10;

export async function getMe(req, res) {
  const user = await User.findById(req.user.id).select(
    'name email comradeHandle comradeId status role settings lastSeenAt isOnline blockedUsers mutedUsers',
  );
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({ user });
}

export async function updateMe(req, res) {
  const { name, settings } = req.body;
  const update = {};
  if (name) update.name = name;
  if (settings) update.settings = settings;

  const user = await User.findByIdAndUpdate(req.user.id, update, {
    new: true,
  }).select('name email comradeHandle comradeId status role settings lastSeenAt isOnline');
  return res.json({ user });
}

export async function searchUsers(req, res) {
  const { query, by } = req.query;
  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  const q = String(query).trim();
  const currentUser = await User.findById(req.user.id);

  const filter = { status: 'active' };

  if (by === 'email') {
    // respect searchableByEmail
    filter.email = q.toLowerCase();
    filter['settings.searchableByEmail'] = true;
  } else if (by === 'id') {
    filter.comradeId = q;
  } else {
    // default: name/handle search
    filter.$or = [
      { comradeHandle: q.startsWith('@') ? q : `@${q}` },
      { name: { $regex: q, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .limit(20)
    .select('name comradeHandle comradeId isOnline lastSeenAt');

  const sanitized = users.filter((u) => u._id.toString() !== currentUser._id.toString());

  return res.json({ users: sanitized });
}

export async function blockUser(req, res) {
  const targetId = req.params.id;
  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'Cannot block yourself' });
  }

  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ message: 'User not found' });

  if (!me.blockedUsers.includes(targetId)) {
    me.blockedUsers.push(targetId);
    await me.save();
  }

  return res.json({ message: 'User blocked' });
}

export async function unblockUser(req, res) {
  const targetId = req.params.id;
  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ message: 'User not found' });

  me.blockedUsers = me.blockedUsers.filter((id) => id.toString() !== targetId);
  await me.save();

  return res.json({ message: 'User unblocked' });
}

export async function muteUser(req, res) {
  const targetId = req.params.id;
  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'Cannot mute yourself' });
  }

  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ message: 'User not found' });

  if (!me.mutedUsers.includes(targetId)) {
    me.mutedUsers.push(targetId);
    await me.save();
  }

  return res.json({ message: 'User muted' });
}

export async function unmuteUser(req, res) {
  const targetId = req.params.id;
  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ message: 'User not found' });

  me.mutedUsers = me.mutedUsers.filter((id) => id.toString() !== targetId);
  await me.save();

  return res.json({ message: 'User unmuted' });
}

export async function reportUser(req, res) {
  const targetId = req.params.id;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ message: 'Reason is required' });
  }
  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'Cannot report yourself' });
  }

  const reporterId = req.user.id;

  let report = await Report.findOne({ reporter: reporterId, reportedUser: targetId });
  if (report) {
    return res.status(409).json({ message: 'You have already reported this user' });
  }

  report = await Report.create({ reporter: reporterId, reportedUser: targetId, reason });

  const distinctReports = await Report.distinct('reporter', {
    reportedUser: targetId,
  });

  const reportedUser = await User.findById(targetId);
  if (reportedUser) {
    reportedUser.reportedByCount = distinctReports.length;
    if (reportedUser.reportedByCount >= REPORT_THRESHOLD && reportedUser.status === 'active') {
      reportedUser.status = 'blocked_due_to_reports';
    }
    await reportedUser.save();
  }

  return res.status(201).json({ message: 'User reported', reportId: report._id });
}

export async function createUnblockRequest(req, res) {
  const { explanation } = req.body;
  if (!explanation) {
    return res.status(400).json({ message: 'Explanation is required' });
  }

  const existing = await UnblockRequest.findOne({
    user: req.user.id,
    status: 'pending',
  });
  if (existing) {
    return res.status(409).json({ message: 'You already have a pending request' });
  }

  const request = await UnblockRequest.create({ user: req.user.id, explanation });
  return res.status(201).json({ request });
}
