import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { sendVerificationEmail } from '../services/emailService.js';

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

  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const user = await User.create({
    name,
    email: emailLower,
    passwordHash,
    comradeId: normalizedId,
    emailVerified: false,
    emailVerificationCode: verificationCode,
    emailVerificationExpiresAt: expiresAt,
  });

  try {
    await sendVerificationEmail(user.email, verificationCode);
    console.log('Verification email sent successfully to:', user.email);
  } catch (emailError) {
    console.error('Failed to send verification email during registration:', {
      email: user.email,
      error: emailError.message,
      stack: emailError.stack
    });
    // User is created but email failed - we'll let them know to request a new code
  }

  return res.status(201).json({
    message: 'Registration successful. Please check your email for the verification code.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
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
    console.log('Verification email resent successfully to:', user.email);
  } catch (emailError) {
    console.error('Failed to resend verification email:', {
      email: user.email,
      error: emailError.message,
      stack: emailError.stack
    });
    // Still return success to user, but log the error
  }

  return res.json({ message: 'Verification code resent' });
}
