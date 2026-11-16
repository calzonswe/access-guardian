// In-app notification plus (best-effort) e-mail to one user.
import { sendMailToUser, isEmailEnabled, htmlEscape } from './email.js';
import { notificationEmailsEnabled } from './settings.js';

export async function notifyUser(db, userId, { title, message, type = 'info', link }) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, read, link)
       VALUES ($1,$2,$3,$4,false,$5)`,
      [userId, title, message, type, link || null]
    );
  } catch (err) {
    console.warn('[notify] insert failed:', err.message);
  }
  if (isEmailEnabled() && await notificationEmailsEnabled()) {
    sendMailToUser(userId, {
      subject: title,
      title,
      body: `<p>${htmlEscape(message)}</p>`,
      ctaLabel: link ? 'Öppna i Access Guardian' : undefined,
      ctaUrl: link,
    }).catch(() => {});
  }
}
