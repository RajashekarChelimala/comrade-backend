export function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();

  // Allow safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  // Allow auth endpoints without CSRF so login/registration/verification work
  const path = req.path || '';
  if (
    path === '/auth/login' ||
    path === '/auth/register' ||
    path === '/auth/verify-email' ||
    path === '/auth/resend-verification' ||
    path === '/auth/refresh'
  ) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.comrade_csrf;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  return next();
}
