const attempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function rateLimit(ip) {
  const now = Date.now();
  const record = attempts.get(ip);

  if (record) {
    const expires = record.expires;
    if (now > expires) {
      attempts.delete(ip);
    } else if (record.count >= MAX_ATTEMPTS) {
      return false;
    } else {
      record.count++;
      return true;
    }
  }

  attempts.set(ip, { count: 1, expires: now + WINDOW_MS });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts.entries()) {
    if (now > record.expires) {
      attempts.delete(ip);
    }
  }
}, 60000);
