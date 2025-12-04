import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { sendVerificationEmail } from '../services/emailService.js';

function generateComradeHandle(base) {
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `@${cleaned}`;
}

function generateComradeId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `CM${n}`;
}

async function generateUniqueHandle(name) {
  let attempt = 0;
  while (attempt < 5) {
    const base = attempt === 0 ? name : `${name}${attempt}`;
    const handle = generateComradeHandle(base);
    // eslint-disable-next-line no-await-in-loop
    const existing = await User.findOne({ comradeHandle: handle });
    if (!existing) return handle;
    attempt += 1;
  }
  // fallback
  return `${generateComradeHandle(name)}${Date.now().toString().slice(-4)}`;
}

async function generateUniqueComradeId() {
  while (true) {
    const id = generateComradeId();
    // eslint-disable-next-line no-await-in-loop
    const existing = await User.findOne({ comradeId: id });
    if (!existing) return id;
  }
}

export async function register(req, res) {
  const flags = getFeatureFlags();
  if (!flags.FEATURE_ENABLE_REGISTRATION) {
    return res.status(403).json({ message: 'Registration is temporarily disabled' });
  }

  const { name, email, password, handle, comradeId: preferredComradeId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }

  const emailLower = email.toLowerCase();
  if (!emailLower.endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Only gmail.com addresses are allowed' });
  }

  const existing = await User.findOne({ email: emailLower });
  if (existing) {
    return res.status(409).json({ message: 'Email is already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let comradeHandle = handle ? generateComradeHandle(handle) : await generateUniqueHandle(name);
  const handleExists = await User.findOne({ comradeHandle });
  if (handleExists) {
    comradeHandle = await generateUniqueHandle(name);
  }

  let comradeId;
  if (preferredComradeId) {
    // normalize like Instagram-style ID: lowercased, alphanumeric + underscore
    const normalized = String(preferredComradeId)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    if (!normalized) {
      return res.status(400).json({ message: 'Invalid comradeId format' });
    }
    const existsId = await User.findOne({ comradeId: normalized });
    if (existsId) {
      return res.status(409).json({ message: 'Comrade ID is already taken' });
    }
    comradeId = normalized;
  } else {
    comradeId = await generateUniqueComradeId();
  }

  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const user = await User.create({
    name,
    email: emailLower,
    passwordHash,
    comradeHandle,
    comradeId,
    emailVerified: false,
    emailVerificationCode: verificationCode,
    emailVerificationExpiresAt: expiresAt,
  });

  try {
    await sendVerificationEmail(user.email, verificationCode);
  } catch (e) {
    // If email sending fails, still create user but inform client
  }

  return res.status(201).json({
    message: 'Registration successful. Please check your email for the verification code.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      comradeHandle: user.comradeHandle,
      comradeId: user.comradeId,
      emailVerified: user.emailVerified,
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
      comradeHandle: user.comradeHandle,
      comradeId: user.comradeId,
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
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

export async function me(req, res) {
  const user = await User.findById(req.user.id).select(
    'name email comradeHandle comradeId status role settings lastSeenAt isOnline',
  );
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({ user });
}

export async function verifyEmail(req, res) {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: 'Email and code are required' });
  }

  const emailLower = email.toLowerCase();
  const user = await User.findOne({ email: emailLower });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.emailVerified) {
    return res.status(400).json({ message: 'Email already verified' });
  }

  if (!user.emailVerificationCode || !user.emailVerificationExpiresAt) {
    return res.status(400).json({ message: 'No active verification code' });
  }

  if (user.emailVerificationExpiresAt < new Date()) {
    return res.status(400).json({ message: 'Verification code has expired' });
  }

  if (String(code).trim() !== user.emailVerificationCode) {
    return res.status(400).json({ message: 'Invalid verification code' });
  }

  user.emailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();

  return res.json({ message: 'Email verified successfully' });
}

export async function resendVerification(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const emailLower = email.toLowerCase();
  const user = await User.findOne({ email: emailLower });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.emailVerified) {
    return res.status(400).json({ message: 'Email already verified' });
  }

  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpiresAt = expiresAt;
  await user.save();

  try {
    await sendVerificationEmail(user.email, verificationCode);
  } catch (e) {
    // ignore email errors
  }

  return res.json({ message: 'Verification code resent' });
}
