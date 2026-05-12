/**
 * In-memory rate limiting with sliding windows.
 *
 * Two interfaces are exported:
 *  - rateLimit(ip)              -> legacy login-only check (10 / 15 min)
 *  - createRateLimit(opts)      -> Express middleware factory for general use
 *
 * NOTE: This is per-process. Behind multiple replicas use a shared store
 * (Redis) instead.
 */

// ---------- Legacy login limiter ----------
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

export function rateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record) {
    if (now > record.expires) {
      loginAttempts.delete(ip);
    } else if (record.count >= LOGIN_MAX) {
      return false;
    } else {
      record.count++;
      return true;
    }
  }
  loginAttempts.set(ip, { count: 1, expires: now + LOGIN_WINDOW_MS });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now > record.expires) loginAttempts.delete(ip);
  }
}, 60_000).unref?.();

// ---------- Generic limiter middleware factory ----------
/**
 * @param {object} opts
 * @param {number} opts.windowMs   - window size in ms
 * @param {number} opts.max        - max requests per window per key
 * @param {(req)=>string} [opts.keyFn] - key extractor (default: user id || ip)
 * @param {string} [opts.message]
 */
export function createRateLimit({ windowMs, max, keyFn, message } = {}) {
  const buckets = new Map();
  const msg = message || 'För många förfrågningar. Vänta en stund och försök igen.';

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (now > v.expires) buckets.delete(k);
    }
  }, Math.min(windowMs, 60_000)).unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const key = (keyFn ? keyFn(req) : (req.user?.id || req.ip || 'unknown')) || 'unknown';
    const now = Date.now();
    const rec = buckets.get(key);
    if (!rec || now > rec.expires) {
      buckets.set(key, { count: 1, expires: now + windowMs });
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(max - 1));
      return next();
    }
    if (rec.count >= max) {
      const retry = Math.ceil((rec.expires - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: msg });
    }
    rec.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - rec.count));
    next();
  };
}
