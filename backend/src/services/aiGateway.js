// Lovable AI Gateway client (OpenAI Responses API, streamed SSE, accumulated server-side).
const GATEWAY_URL = (process.env.AI_GATEWAY_URL || 'https://ai.gateway.lovable.dev').replace(/\/+$/, '').replace(/\/v1$/, '');
export const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-6-astra';

export function isAiConfigured() {
  return !!process.env.LOVABLE_API_KEY;
}

export class AiGatewayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Streams a Responses call and returns the final output text. */
export async function generateText({ instructions, input, signal }) {
  const res = await fetch(`${GATEWAY_URL}/v1/responses`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': process.env.LOVABLE_API_KEY,
      'X-Lovable-AIG-SDK': 'fetch',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      instructions,
      input,
      stream: true,
      store: false,
      reasoning: { effort: 'medium', summary: 'auto' },
      include: ['reasoning.encrypted_content'],
    }),
  });

  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j?.error?.message || j?.message || ''; } catch { /* ignore */ }
    throw new AiGatewayError(res.status, msg || `AI-tjänsten svarade med status ${res.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completedText = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.type === 'response.output_text.delta') text += ev.delta || '';
        else if (ev.type === 'response.output_text.done' && ev.text) completedText = ev.text;
        else if (ev.type === 'error' || ev.type === 'response.failed') {
          throw new AiGatewayError(502, ev.error?.message || ev.response?.error?.message || 'AI-tjänsten misslyckades');
        }
      }
    }
  }
  const out = (completedText || text).trim();
  if (!out) throw new AiGatewayError(502, 'AI-tjänsten returnerade inget svar');
  return out;
}
