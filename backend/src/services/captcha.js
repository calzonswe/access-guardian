// ============= Lightweight math captcha =============
// Used to deter bots from spamming the public contractor application form
// without bringing in a third-party service. Stateless from the client's
// perspective; we keep an in-memory map of token -> { answer, expiresAt }.
// One-time use; expires after 10 minutes. Suitable for a single-instance
// deployment — for HA, replace with a Redis/Postgres-backed store.

import { randomBytes } from 'crypto';

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;
const store = new Map();

function gc() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  // Hard cap if still oversized
  while (store.size > MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (!firstKey) break;
    store.delete(firstKey);
  }
}

export function issueCaptcha() {
  gc();
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const op = Math.random() < 0.5 ? '+' : '-';
  const answer = op === '+' ? a + b : a - b;
  const token = randomBytes(16).toString('hex');
  store.set(token, { answer, expiresAt: Date.now() + TTL_MS });
  return { token, question: `${a} ${op} ${b}` };
}

export function verifyCaptcha(token, answer) {
  if (!token || answer === undefined || answer === null) return false;
  const entry = store.get(token);
  if (!entry) return false;
  store.delete(token); // one-time use, regardless of correctness
  if (entry.expiresAt < Date.now()) return false;
  const n = Number(answer);
  return Number.isFinite(n) && n === entry.answer;
}
