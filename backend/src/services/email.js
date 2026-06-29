// ============= SMTP email service =============
// Thin wrapper around nodemailer. Disabled unless SMTP_HOST is set, so the
// on-prem stack can run without email until SMTP is configured.

import nodemailer from 'nodemailer';
import { pool } from '../db.js';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@access-guardian.local';
const APP_BASE_URL = process.env.APP_BASE_URL || '';

let transporter = null;
let verified = false;
let lastError = null;
let lastSentAt = null;

export function isEmailEnabled() {
  return !!SMTP_HOST;
}

function getTransport() {
  if (!isEmailEnabled()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  transporter.verify().then(() => {
    verified = true;
    lastError = null;
    console.log(`[email] SMTP ready ${SMTP_HOST}:${SMTP_PORT}`);
  }).catch(err => {
    verified = false;
    lastError = err.message;
    console.warn(`[email] SMTP verify failed: ${err.message}`);
  });
  return transporter;
}

export function getEmailStatus() {
  return {
    enabled: isEmailEnabled(),
    host: SMTP_HOST || null,
    port: SMTP_HOST ? SMTP_PORT : null,
    secure: SMTP_HOST ? SMTP_SECURE : null,
    from: SMTP_HOST ? SMTP_FROM : null,
    verified,
    lastError,
    lastSentAt,
  };
}

function htmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildHtml({ title, body, ctaLabel, ctaUrl }) {
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:28px 0"><a href="${htmlEscape(ctaUrl)}" style="background:#1f4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">${htmlEscape(ctaLabel)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;margin:0;padding:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb">
<tr><td style="padding:28px 32px;color:#111827">
<h1 style="margin:0 0 12px;font-size:20px;color:#111827">${htmlEscape(title)}</h1>
<div style="font-size:14px;line-height:1.55;color:#374151">${body}</div>
${cta}
<p style="color:#9ca3af;font-size:12px;margin-top:32px">Access Guardian — automatiskt meddelande, svara ej.</p>
</td></tr></table></body></html>`;
}

/**
 * Send an email. Resolves true if accepted by SMTP, false otherwise.
 * Never throws — logs and returns false on error so callers don't break.
 */
export async function sendMail({ to, subject, text, html, title, body, ctaLabel, ctaUrl }) {
  const tx = getTransport();
  if (!tx || !to) return false;
  try {
    const finalHtml = html || buildHtml({
      title: title || subject,
      body: body || (text ? `<p>${htmlEscape(text)}</p>` : ''),
      ctaLabel,
      ctaUrl: ctaUrl && APP_BASE_URL && ctaUrl.startsWith('/') ? `${APP_BASE_URL}${ctaUrl}` : ctaUrl,
    });
    const finalText = text || (body ? body.replace(/<[^>]+>/g, '') : subject);
    await tx.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text: finalText,
      html: finalHtml,
    });
    lastSentAt = new Date().toISOString();
    return true;
  } catch (err) {
    lastError = err.message;
    console.error('[email] send failed:', err.message);
    return false;
  }
}

/**
 * Fetch a user's email (and full name) and send a notification mail.
 * No-op if user has no email or SMTP isn't configured.
 */
export async function sendMailToUser(userId, opts) {
  if (!isEmailEnabled()) return false;
  try {
    const { rows } = await pool.query(
      'SELECT email, full_name FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );
    const u = rows[0];
    if (!u?.email) return false;
    return await sendMail({ to: u.email, ...opts });
  } catch (err) {
    console.error('[email] sendMailToUser failed:', err.message);
    return false;
  }
}

export function isVerified() {
  return verified;
}
