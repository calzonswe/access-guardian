import { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import * as api from '@/services/api';
import * as store from '@/services/dataStore';
import type { LogAnalysisResult } from '@/services/api';
import { t, locale } from '@/i18n';

/** AI-assisted analysis of the audit log (administrators only, API mode only). */
export default function LogAnalysisPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [question, setQuestion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LogAnalysisResult | null>(null);

  useEffect(() => {
    if (!store.isApiMode()) { setConfigured(false); return; }
    api.getLogAnalysisStatus()
      .then(s => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  if (configured === null) return null;

  if (!configured) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t('AI-analys av loggen är inte aktiverad (kräver backend med LOVABLE_API_KEY).')}
        </CardContent>
      </Card>
    );
  }

  const run = async () => {
    setError('');
    setResult(null);
    if (question.trim().length < 5) { setError(t('Beskriv incidenten eller frågan (minst 5 tecken)')); return; }
    setRunning(true);
    try {
      const res = await api.analyzeLogs({
        question: question.trim(),
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Analysen misslyckades'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />AI-analys av granskningsloggen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder={t('Beskriv incidenten eller ställ en fråga, t.ex. ”Vem godkände tillträde till Lager B förra veckan?”')}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          maxLength={2000}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="la-from" className="text-xs">{t('Från')}</Label>
            <Input id="la-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="la-to" className="text-xs">{t('Till')}</Label>
            <Input id="la-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t('Analysera')}
          </Button>
          <span className="text-xs text-muted-foreground">Standard: senaste 30 dagarna</span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-foreground whitespace-pre-wrap">{result.summary}</p>
            {result.timeline.length > 0 && (
              <ol className="space-y-2 border-l pl-4">
                {result.timeline.map(item => (
                  <li key={item.log_id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(item.event.created_at).toLocaleString(locale())}</span>
                      <Badge variant="outline" className="text-xs">{item.event.action}</Badge>
                      {item.event.actor_name && <span className="text-xs text-muted-foreground">{item.event.actor_name}</span>}
                    </div>
                    <p className="text-foreground">{item.description}</p>
                  </li>
                ))}
              </ol>
            )}
            {result.gaps && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                <p className="font-medium text-warning flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{t('Luckor i underlaget')}</p>
                <p className="text-foreground whitespace-pre-wrap">{result.gaps}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {result.eventsAnalyzed} {t('händelser analyserade')}{result.truncated ? t(' (urvalet begränsades — snäva in intervallet)') : ''}
              {result.rejectedReferences > 0 ? ` · ${result.rejectedReferences} overifierade referenser bortfiltrerade` : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
