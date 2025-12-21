import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { UnblockRequest } from '../models/UnblockRequest.js';

const REPORT_THRESHOLD = 10;

export async function getMe(req, res) {
  const user = await User.findById(req.user.id).select(
    'name email comradeId status role settings lastSeenAt isOnline blockedUsers mutedUsers',
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
  }).select('name email comradeId status role settings lastSeenAt isOnline');
  return res.json({ user });
}

import { ChatRequest } from '../models/ChatRequest.js';

export async function searchUsers(req, res) {
  const { query, by } = req.query;
  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  const q = String(query).trim();
  const currentUserId = req.user.id;
  const currentUser = await User.findById(currentUserId);

  const filter = { status: 'active' };

  if (by === 'email') {
    // respect searchableByEmail
    filter.email = q.toLowerCase();
    filter['settings.searchableByEmail'] = true;
  } else if (by === 'id') {
    filter.comradeId = q;
  } else {
    // default: name/comradeId search
    filter.$or = [
      { comradeId: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
    ];
  }

  // GLOBAL PRIVACY FILTER: User must be searchable
  filter['settings.isSearchable'] = { $ne: false };

  const users = await User.find(filter)
    .limit(20)
    .select('name comradeId isOnline lastSeenAt');

  const sanitized = users.filter((u) => u._id.toString() !== currentUserId);

  // Check relationship status for each user
  const resultsWithStatus = await Promise.all(
    sanitized.map(async (u) => {
      const request = await ChatRequest.findOne({
        $or: [
          { sender: currentUserId, recipient: u._id },
          { sender: u._id, recipient: currentUserId },
        ],
      });

      let relationship = 'NONE';
      let requestId = null;

      if (request) {
        requestId = request._id;
        if (request.status === 'ACCEPTED') {
          relationship = 'FRIEND';
        } else if (request.status === 'PENDING') {
          relationship = request.sender.toString() === currentUserId ? 'SENT' : 'RECEIVED';
        } else if (request.status === 'REJECTED') {
          // If rejected, we might want to treat as NONE to allow re-request if allowed, 
          // but for now, let's return NONE so UI shows "Add Friend" if cool-down passed (logic elsewhere)
          // or simple NONE. The request controller checks limits.
          relationship = 'NONE';
        }
      }

      return {
        ...u.toObject(),
        relationship,
        requestId,
      };
    })
  );

  return res.json({ users: resultsWithStatus });
}

export async function getFriends(req, res) {
  const userId = req.user.id;

  // Find all accepted requests involving the user
  const requests = await ChatRequest.find({
    status: 'ACCEPTED',
    $or: [{ sender: userId }, { recipient: userId }],
  }).populate([{ path: 'sender', select: 'name comradeId isOnline lastSeenAt' }, { path: 'recipient', select: 'name comradeId isOnline lastSeenAt' }]);

  const friends = requests.map(r => {
    const isSender = r.sender._id.toString() === userId;
    // Return the other person
    return isSender ? r.recipient : r.sender;
  });

  return res.json({ friends });
}

export async function removeFriend(req, res) {
  const userId = req.user.id;
  const targetId = req.params.id;

  // Find and remove the accepted request
  const result = await ChatRequest.findOneAndDelete({
    status: 'ACCEPTED',
    $or: [
      { sender: userId, recipient: targetId },
      { sender: targetId, recipient: userId },
    ],
  });

  if (!result) {
    return res.status(404).json({ message: 'Friendship not found' });
  }

  return res.json({ message: 'Friend removed' });
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
