import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';
import { generateText, isAiConfigured, AiGatewayError } from '../services/aiGateway.js';

const router = Router();
router.use(requireRole('administrator'));

const MAX_EVENTS = 400;

const INSTRUCTIONS = `Du är en säkerhetsanalytiker som granskar ett tillträdessystems granskningslogg.
Du får en fråga eller incidentbeskrivning samt en lista med logghändelser (JSON, varje händelse har ett unikt "id").
Regler:
- Använd ENDAST de händelser som finns i listan. Hitta aldrig på händelser, personer eller tider.
- Varje tidslinjepost MÅSTE referera till ett befintligt händelse-id i fältet "log_id".
- Om underlaget inte räcker, säg det tydligt i "gaps".
- Svara på svenska.
- Svara ENBART med JSON enligt: {"summary": string, "timeline": [{"log_id": string, "description": string}], "gaps": string}
- Tidslinjen ska vara kronologisk och innehålla högst 40 poster.`;

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

router.get('/status', (_req, res) => {
  res.json({ configured: isAiConfigured() });
});

router.post('/', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (question.length < 5 || question.length > 2000) {
    return res.status(400).json({ error: 'Beskriv incidenten eller frågan (5–2000 tecken)' });
  }
  if (!isAiConfigured()) {
    return res.status(503).json({ error: 'AI-analys är inte konfigurerad (LOVABLE_API_KEY saknas på servern)' });
  }

  const now = new Date();
  const to = req.body.to ? new Date(req.body.to) : now;
  const from = req.body.from ? new Date(req.body.from) : new Date(to.getTime() - 30 * 86400000);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ error: 'Ogiltigt datumintervall' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.action, l.created_at, l.target_type, l.target_id, l.details, l.actor_id,
              u.full_name AS actor_name
         FROM system_logs l LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.created_at BETWEEN $1 AND $2
        ORDER BY l.created_at DESC
        LIMIT ${MAX_EVENTS}`,
      [from, to]
    );
    const events = rows.reverse();
    if (events.length === 0) {
      return res.json({ summary: 'Inga logghändelser finns i det valda intervallet.', timeline: [], gaps: '', eventsAnalyzed: 0, truncated: false });
    }

    const compact = events.map(e => ({
      id: String(e.id), time: new Date(e.created_at).toISOString(), action: e.action,
      actor: e.actor_name || (e.actor_id ? String(e.actor_id) : 'system/okänd'),
      target: e.target_type ? `${e.target_type}:${e.target_id ?? ''}` : undefined,
      details: e.details ? String(e.details).slice(0, 300) : undefined,
    }));

    const controller = new AbortController();
    req.on('close', () => { if (!res.writableEnded) controller.abort(); });

    const text = await generateText({
      instructions: INSTRUCTIONS,
      input: `Fråga/incident:\n${question}\n\nLogghändelser (${compact.length} st, ${from.toISOString()} – ${to.toISOString()}):\n${JSON.stringify(compact)}`,
      signal: controller.signal,
    });

    const parsed = parseJson(text);
    if (!parsed) return res.status(502).json({ error: 'AI-svaret kunde inte tolkas' });

    // Verification: keep only entries that reference real log rows, and attach the original record.
    const byId = new Map(events.map(e => [String(e.id), e]));
    const timeline = [];
    let rejected = 0;
    for (const item of Array.isArray(parsed.timeline) ? parsed.timeline : []) {
      const ev = byId.get(String(item?.log_id));
      if (!ev) { rejected++; continue; }
      timeline.push({
        log_id: String(ev.id), description: String(item.description || ''),
        event: { action: ev.action, created_at: ev.created_at, actor_name: ev.actor_name, actor_id: ev.actor_id, target_type: ev.target_type, target_id: ev.target_id, details: ev.details },
      });
    }
    timeline.sort((a, b) => new Date(a.event.created_at).getTime() - new Date(b.event.created_at).getTime());

    await audit({ req, action: 'audit_ai_query', targetType: 'system_logs', details: `AI-analys: ${question.slice(0, 200)}` });

    res.json({
      summary: String(parsed.summary || ''),
      gaps: String(parsed.gaps || ''),
      timeline,
      rejectedReferences: rejected,
      eventsAnalyzed: events.length,
      truncated: events.length >= MAX_EVENTS,
      from, to,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return res.status(499).end();
    if (err instanceof AiGatewayError) {
      const status = [400, 401, 402, 403, 404, 429].includes(err.status) ? err.status : 502;
      const msg = err.status === 402 ? 'AI-krediterna är slut. Fyll på krediter i arbetsytan.'
        : err.status === 429 ? 'AI-tjänsten är tillfälligt överbelastad. Försök igen om en stund.'
        : err.message;
      return res.status(status === 401 ? 502 : status).json({ error: msg });
    }
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
