// Backend translations. Swedish is the source language and the key: messages
// are written in Swedish in the code and translated on the way out
// (JSON errors, stored notifications, e-mails) for users who chose English.
// Keys with {placeholders} are patterns, so messages containing values
// ("Max 500 rader per import") are translated too.
import EN from './i18n.en.js';

export const LANGS = ['sv', 'en'];

const exact = new Map();
const patterns = [];
for (const [sv, en] of Object.entries(EN)) {
  if (/\{\w+\}/.test(sv)) {
    const names = [];
    const source = sv
      .split(/(\{\w+\})/)
      .map(part => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) { names.push(m[1]); return '(.+?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    patterns.push({ re: new RegExp(`^${source}$`, 's'), names, en, specificity: sv.replace(/\{\w+\}/g, '').length });
  } else {
    exact.set(sv, en);
  }
}
// Most specific patterns first ("…dagar" before "…dag").
patterns.sort((a, b) => b.specificity - a.specificity);

/** Translate a value captured from a pattern (e.g. a status label or a list). */
function translateValue(value) {
  if (exact.has(value)) return exact.get(value);
  // Lists such as "stora bokstäver, siffror och specialtecken"
  if (/, | och /.test(value)) {
    const parts = value.split(/(, | och )/);
    if (parts.some(p => exact.has(p))) {
      return parts.map(p => (p === ' och ' ? ' and ' : exact.get(p) ?? p)).join('');
    }
  }
  return value;
}

/** Swedish text -> the given language. Unknown text is returned unchanged. */
export function translate(text, lang) {
  if (lang !== 'en' || typeof text !== 'string' || !text) return text;
  if (exact.has(text)) return exact.get(text);
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const values = Object.fromEntries(p.names.map((n, i) => [n, translateValue(m[i + 1])]));
    return p.en.replace(/\{(\w+)\}/g, (_, n) => values[n] ?? `{${n}}`);
  }
  return text;
}

export function normalizeLang(v) {
  const s = String(v || '').toLowerCase().slice(0, 2);
  return s === 'en' ? 'en' : 'sv';
}

/** Language of the current request: the user's, else X-Language, else Accept-Language. */
export function requestLanguage(req) {
  if (req.user?.language) return normalizeLang(req.user.language);
  if (req.headers?.['x-language']) return normalizeLang(req.headers['x-language']);
  const accept = String(req.headers?.['accept-language'] || '');
  return /^en\b/i.test(accept.trim()) ? 'en' : 'sv';
}

/** A user's stored language ('sv' when unknown). */
export async function userLanguage(db, userId) {
  if (!userId) return 'sv';
  const { rows } = await db.query('SELECT language FROM users WHERE id = $1', [userId]);
  return normalizeLang(rows[0]?.language);
}

/** Language for an e-mail address (password reset / welcome mails). */
export async function emailLanguage(db, email) {
  const { rows } = await db.query('SELECT language FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  return normalizeLang(rows[0]?.language);
}

/**
 * Express middleware: translate `error` / `message` fields (and per-row
 * `results[].message`) of JSON responses into the request's language.
 * The language is read when the response is sent, after authentication.
 */
export function translateResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    const lang = requestLanguage(req);
    if (lang === 'en' && body && typeof body === 'object' && !Array.isArray(body)) {
      const out = { ...body };
      if (typeof out.error === 'string') out.error = translate(out.error, lang);
      if (typeof out.message === 'string') out.message = translate(out.message, lang);
      if (Array.isArray(out.results)) {
        out.results = out.results.map(r => (r && typeof r.message === 'string' ? { ...r, message: translate(r.message, lang) } : r));
      }
      return json(out);
    }
    return json(body);
  };
  next();
}
