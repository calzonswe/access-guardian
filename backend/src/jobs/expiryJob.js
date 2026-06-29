/**
 * Background expiry job.
 *
 * Runs on an interval and:
 *  1. Marks approved applications whose end_date has passed as 'expired',
 *     logs `access_expired`, and notifies the applicant.
 *  2. Marks user_requirements whose expires_at has passed as 'expired',
 *     logs `requirement_expired`, and notifies the user.
 *  3. Sends advance warning notifications based on settings.notifications.expiryWarningDays
 *     (default [30, 7, 1]) for both upcoming application end_dates and
 *     user_requirements.expires_at — one notification per (target, days) pair.
 *
 * Deduplication is best-effort: we check for an existing notification with
 * the same link + title in the last 48h before inserting.
 */

import { pool } from '../db.js';
import { sendMailToUser, isEmailEnabled } from '../services/email.js';
import { logger } from '../services/logger.js';

const DEFAULT_WARNING_DAYS = [30, 7, 1];

// Runtime stats exposed via /api/admin/system-status
const stats = {
  lastRunAt: null,
  lastDurationMs: null,
  lastResult: null,
  lastError: null,
  totalRuns: 0,
  intervalMs: null,
  enabled: false,
};

export function getExpiryStats() {
  return { ...stats };
}

async function getWarningDays() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'notifications'`
    );
    const days = rows[0]?.value?.expiryWarningDays;
    if (Array.isArray(days) && days.length > 0) {
      return days.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_WARNING_DAYS;
}

async function notifyOnce(client, { userId, title, message, type, link, email = true }) {
  // Skip if we already created an identical notification recently (48h window)
  const { rowCount } = await client.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1 AND title = $2 AND COALESCE(link,'') = COALESCE($3,'')
       AND created_at > now() - INTERVAL '48 hours'
     LIMIT 1`,
    [userId, title, link || null]
  );
  if (rowCount > 0) return false;
  await client.query(
    `INSERT INTO notifications (user_id, title, message, type, read, link)
     VALUES ($1,$2,$3,$4,false,$5)`,
    [userId, title, message, type, link || null]
  );
  // Fire-and-forget email (no await on commit path)
  if (email && isEmailEnabled()) {
    sendMailToUser(userId, {
      subject: title,
      title,
      body: `<p>${message}</p>`,
      ctaLabel: link ? 'Öppna i Access Guardian' : undefined,
      ctaUrl: link,
    }).catch(() => {});
  }
  return true;
}

async function processExpiredApplications(client) {
  const { rows } = await client.query(
    `UPDATE applications
       SET status = 'expired', updated_at = now()
     WHERE status = 'approved'
       AND end_date IS NOT NULL
       AND end_date < CURRENT_DATE
     RETURNING id, applicant_id, facility_id`
  );
  for (const r of rows) {
    await client.query(
      `INSERT INTO system_logs (action, actor_id, target_id, target_type, details)
       VALUES ('access_expired', $1, $2, 'application', $3)`,
      [r.applicant_id, r.id, 'Åtkomst har gått ut automatiskt']
    );
    await notifyOnce(client, {
      userId: r.applicant_id,
      title: 'Åtkomst utgången',
      message: 'Din åtkomst till anläggningen har gått ut.',
      type: 'warning',
      link: `/applications/${r.id}`,
    });
  }
  return rows.length;
}

async function processExpiredRequirements(client) {
  const { rows } = await client.query(
    `UPDATE user_requirements
       SET status = 'expired'
     WHERE status <> 'expired'
       AND expires_at IS NOT NULL
       AND expires_at < now()
     RETURNING id, user_id, requirement_id`
  );
  for (const r of rows) {
    await client.query(
      `INSERT INTO system_logs (action, actor_id, target_id, target_type, details)
       VALUES ('requirement_expired', $1, $2, 'user_requirement', $3)`,
      [r.user_id, r.id, 'Kravet har gått ut automatiskt']
    );
    await notifyOnce(client, {
      userId: r.user_id,
      title: 'Krav utgånget',
      message: 'Ett av dina krav har gått ut. Förnya det för att behålla åtkomst.',
      type: 'action_required',
      link: '/my-access',
    });
  }
  return rows.length;
}

async function processUpcomingApplications(client, warningDays) {
  let count = 0;
  for (const days of warningDays) {
    const { rows } = await client.query(
      `SELECT id, applicant_id, end_date
         FROM applications
        WHERE status = 'approved'
          AND end_date IS NOT NULL
          AND end_date = CURRENT_DATE + ($1 || ' days')::INTERVAL`,
      [String(days)]
    );
    for (const r of rows) {
      const created = await notifyOnce(client, {
        userId: r.applicant_id,
        title: `Åtkomst går ut om ${days} dag${days === 1 ? '' : 'ar'}`,
        message: `Din åtkomst löper ut ${new Date(r.end_date).toLocaleDateString('sv-SE')}. Förnya i god tid.`,
        type: 'warning',
        link: `/applications/${r.id}`,
      });
      if (created) count++;
    }
  }
  return count;
}

async function processUpcomingRequirements(client, warningDays) {
  let count = 0;
  for (const days of warningDays) {
    const { rows } = await client.query(
      `SELECT ur.id, ur.user_id, ur.expires_at, r.name AS req_name
         FROM user_requirements ur
         JOIN requirements r ON r.id = ur.requirement_id
        WHERE ur.status <> 'expired'
          AND ur.expires_at IS NOT NULL
          AND ur.expires_at::date = CURRENT_DATE + ($1 || ' days')::INTERVAL`,
      [String(days)]
    );
    for (const r of rows) {
      const created = await notifyOnce(client, {
        userId: r.user_id,
        title: `Krav går ut om ${days} dag${days === 1 ? '' : 'ar'}`,
        message: `Kravet "${r.req_name}" löper ut ${new Date(r.expires_at).toLocaleDateString('sv-SE')}.`,
        type: 'warning',
        link: '/my-access',
      });
      if (created) count++;
    }
  }
  return count;
}

export async function runExpiryJob() {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const warningDays = await getWarningDays();
    const expiredApps = await processExpiredApplications(client);
    const expiredReqs = await processExpiredRequirements(client);
    const warnApps = await processUpcomingApplications(client, warningDays);
    const warnReqs = await processUpcomingRequirements(client, warningDays);
    await client.query('COMMIT');
    const result = { expiredApps, expiredReqs, warnApps, warnReqs };
    stats.lastRunAt = new Date().toISOString();
    stats.lastDurationMs = Date.now() - t0;
    stats.lastResult = result;
    stats.lastError = null;
    stats.totalRuns++;
    if (expiredApps + expiredReqs + warnApps + warnReqs > 0) {
      logger.info('expiry-job completed', { ...result, durationMs: stats.lastDurationMs });
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    stats.lastRunAt = new Date().toISOString();
    stats.lastDurationMs = Date.now() - t0;
    stats.lastError = err.message;
    logger.error('expiry-job failed', { err });
  } finally {
    client.release();
  }
}

/**
 * Start the periodic scheduler. Default: every 60 minutes.
 * Override with EXPIRY_JOB_INTERVAL_MS. Set to 0 to disable.
 */
export function startExpiryScheduler() {
  const intervalMs = parseInt(process.env.EXPIRY_JOB_INTERVAL_MS || '3600000', 10);
  stats.intervalMs = intervalMs;
  if (!intervalMs || intervalMs <= 0) {
    stats.enabled = false;
    logger.info('expiry-job disabled (EXPIRY_JOB_INTERVAL_MS=0)');
    return;
  }
  stats.enabled = true;
  // Run shortly after startup, then on the configured interval.
  setTimeout(() => { runExpiryJob().catch(() => {}); }, 10_000).unref?.();
  const handle = setInterval(() => { runExpiryJob().catch(() => {}); }, intervalMs);
  handle.unref?.();
  logger.info('expiry-job scheduled', { intervalSeconds: Math.round(intervalMs / 1000) });
}
