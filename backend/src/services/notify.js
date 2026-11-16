// In-app notification plus (best-effort) e-mail to one user.
import { pool } from '../db.js';
import { sendMailToUser, isEmailEnabled, htmlEscape } from './email.js';
import { notificationEmailsEnabled } from './settings.js';
import { translate, userLanguage } from './i18n.js';

/**
 * E-mail categories a user can switch off (users.email_prefs):
 *  - action: something waits for the user's decision (incl. reminders/escalation)
 *  - status: decisions and changes on the user's own applications/accounts
 *  - expiry: access or requirements about to expire / expired
 * Missing keys (and messages without a category) mean "send".
 */
export const EMAIL_CATEGORIES = ['action', 'status', 'expiry'];

export function shouldEmail(prefs, category) {
  if (!category) return true;
  return !(prefs && prefs[category] === false);
}

/** Should this user get an e-mail for this category right now? */
export async function wantsEmail(db, userId, category) {
  if (!isEmailEnabled() || !(await notificationEmailsEnabled())) return false;
  if (!category) return true;
  const { rows } = await (db || pool).query('SELECT email_prefs FROM users WHERE id = $1', [userId]);
  return shouldEmail(rows[0]?.email_prefs, category);
}

export async function notifyUser(db, userId, { title, message, type = 'info', link, category }) {
  if (!userId) return;
  // Stored (and mailed) in the recipient's language.
  const lang = await userLanguage(db || pool, userId).catch(() => 'sv');
  title = translate(title, lang);
  message = translate(message, lang);
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, read, link)
       VALUES ($1,$2,$3,$4,false,$5)`,
      [userId, title, message, type, link || null]
    );
  } catch (err) {
    console.warn('[notify] insert failed:', err.message);
  }
  if (await wantsEmail(db, userId, category)) {
    sendMailToUser(userId, {
      subject: title,
      title,
      body: `<p>${htmlEscape(message)}</p>`,
      ctaLabel: link ? 'Öppna i Access Guardian' : undefined,
      ctaUrl: link,
      lang,
    }).catch(() => {});
  }
}
