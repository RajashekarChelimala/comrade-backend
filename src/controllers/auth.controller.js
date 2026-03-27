import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { getFeatureFlags } from '../config/featureFlags.js';


// Helper to normalize comradeId
function normalizeComradeId(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9_.]/g, ''); // Allow alphanumeric, underscore, dot
}

// Ensure comradeId is valid format
function isValidComradeId(id) {
  const regex = /^[a-z0-9_.]{3,30}$/;
  return regex.test(id);
}

export async function register(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_REGISTRATION) {
    return res.status(403).json({ message: 'Registration is temporarily disabled' });
  }

  const { name, email, password, comradeId } = req.body;

  if (!name || !email || !password || !comradeId) {
    return res.status(400).json({ message: 'Name, email, password, and comradeId are required' });
  }

  const emailLower = email.toLowerCase();

  // Validation: Only gmail.com addresses allow? (Preserving user rule)
  if (!emailLower.endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Only gmail.com addresses are allowed' });
  }

  const existingEmail = await User.findOne({ email: emailLower });
  if (existingEmail) {
    return res.status(409).json({ message: 'Email is already registered' });
  }

  // Validate and Check comradeId uniqueness
  const normalizedId = normalizeComradeId(comradeId);
  if (!isValidComradeId(normalizedId)) {
    return res.status(400).json({
      message: 'Comrade ID can only contain letters, numbers, underscores, and dots (3-30 characters)'
    });
  }

  const existingId = await User.findOne({ comradeId: normalizedId });
  if (existingId) {
    return res.status(409).json({ message: 'Comrade ID is already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email: emailLower,
    passwordHash,
    comradeId: normalizedId,
    status: 'pending_approval',
    emailVerified: true,
  });

  return res.status(201).json({
    message: 'Registration request sent to admin for approval.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      comradeId: user.comradeId,
      status: user.status,
    },
  });
}

export async function login(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_LOGIN) {
    return res.status(403).json({ message: 'Login is temporarily disabled' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (!user.emailVerified) {
    return res.status(403).json({ message: 'Please verify your email before logging in' });
  }

  if (user.status === 'pending_approval') {
    return res.status(403).json({ message: 'Account is pending admin approval' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ message: 'Account is not active' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const accessToken = signAccessToken(user._id.toString());
  const refreshToken = signRefreshToken(user._id.toString());

  // httpOnly refresh cookie
  res.cookie('comrade_refresh', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // CSRF token cookie (not httpOnly so frontend can read & send header)
  const csrfToken = `${user._id.toString()}:${Date.now()}`;
  res.cookie('comrade_csrf', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      comradeId: user.comradeId,
      role: user.role,
    },
    tokens: {
      accessToken,
    },
    csrfToken,
  });
}

export async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.comrade_refresh;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    const newAccessToken = signAccessToken(user._id.toString());
    const newRefreshToken = signRefreshToken(user._id.toString());

    // Generate new CSRF token for the refreshed session
    const csrfToken = `${user._id.toString()}:${Date.now()}`;
    res.cookie('comrade_csrf', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie('comrade_refresh', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      tokens: {
        accessToken: newAccessToken,
      },
      csrfToken,
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

export async function me(req, res) {
  const user = await User.findById(req.user.id).select(
    'name email comradeId status role settings lastSeenAt isOnline',
  );
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({ user });
}

