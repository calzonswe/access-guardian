import { useRef, useState } from 'react';
import { Download, FileUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as api from '@/services/api';
import { parseCsv, toCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/utils';
import type { ImportResult } from '@/services/api';
import { t } from '@/i18n';

const HEADERS = ['email', 'fornamn', 'efternamn', 'telefon', 'befattning', 'avdelning', 'foretag', 'chef_email', 'roller'];
const MAX_ROWS = 500;
const EXAMPLE = [
  { email: 'anna.berg@foretag.se', fornamn: t('Anna'), efternamn: t('Berg'), telefon: '070-123 45 67', befattning: t('Driftchef'), avdelning: t('Drift'), foretag: '', chef_email: '', roller: t('Linjechef|Anställd') },
  { email: 'erik.lund@foretag.se', fornamn: t('Erik'), efternamn: t('Lund'), telefon: '', befattning: t('Tekniker'), avdelning: t('Drift'), foretag: '', chef_email: 'anna.berg@foretag.se', roller: t('Anställd') },
];

const STATUS = {
  created: { label: t('Skapad'), className: 'status-badge-approved' },
  skipped: { label: t('Fanns redan'), className: 'status-badge-neutral' },
  error: { label: t('Fel'), className: 'status-badge-denied' },
} as const;

function download(name: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** Import users from a CSV file (Excel "CSV UTF-8", ';' or ','). */
export function UserImportDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const reset = () => { setFileName(''); setRows([]); setProblem(''); setResults(null); setBusy(false); };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setResults(null); setProblem('');
    setFileName(file.name);
    const { headers, rows: parsed } = parseCsv(await file.text());
    const missing = ['email', 'fornamn', 'efternamn'].filter(h => !headers.includes(h));
    if (missing.length) { setRows([]); setProblem(t('Kolumner saknas: {v0}. Utgå från mallen.', { v0: missing.join(', ') })); return; }
    if (parsed.length === 0) { setRows([]); setProblem(t('Filen innehåller inga rader.')); return; }
    if (parsed.length > MAX_ROWS) { setRows([]); setProblem(t('Filen har {count} rader. Max {MAX_ROWS} per import – dela upp filen.', { count: parsed.length, MAX_ROWS })); return; }
    setRows(parsed);
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const { results: res } = await api.importUsers(rows);
      setResults(res);
      const created = res.filter(r => r.status === 'created').length;
      toast.success(t('{created} användare skapade', { created }));
      onImported();
    } catch (err) {
      toast.error(errorMessage(err, t('Importen misslyckades')));
    } finally {
      setBusy(false);
    }
  };

  const count = (s: ImportResult['status']) => (results || []).filter(r => r.status === s).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Importera användare')}</DialogTitle>
          <DialogDescription>
            {t('Ladda upp en CSV-fil (spara från Excel som "CSV UTF-8"). Nya användare får ett tillfälligt lösenord och måste byta det vid första inloggningen. E-postadresser som redan finns hoppas över.')}
          </DialogDescription>
        </DialogHeader>

        {!results && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => download('anvandarimport-mall.csv', toCsv(EXAMPLE, HEADERS))}>
                <Download className="mr-2 h-4 w-4" />{t('Ladda ner mall')}
              </Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} id="user-import-file" />
              <Button onClick={() => fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />{t('Välj fil')}</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Kolumner:')} {HEADERS.join(', ')}. Roller skrivs som t.ex. <code>{t('Linjechef|Anställd')}</code> {t('(tom = Anställd).')} <code>chef_email</code> {t('kan peka på en befintlig användare eller någon i samma fil.')}
            </p>
            {problem && <p className="text-sm text-destructive">{problem}</p>}
            {rows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground"><strong>{fileName}</strong>: {rows.length} {t('rader. Förhandsvisning:')}</p>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader><TableRow><TableHead>{t('E-post')}</TableHead><TableHead>{t('Namn')}</TableHead><TableHead>{t('Roller')}</TableHead><TableHead>{t('Chef')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {rows.slice(0, 10).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.email}</TableCell>
                          <TableCell>{`${r.fornamn || ''} ${r.efternamn || ''}`.trim()}</TableCell>
                          <TableCell>{r.roller || t('Anställd')}</TableCell>
                          <TableCell>{r.chef_email || '–'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 10 && <p className="text-xs text-muted-foreground">{t('…och')} {rows.length - 10} rader till.</p>}
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="status-badge-approved">{count('created')} skapade</Badge>
              <Badge variant="outline" className="status-badge-neutral">{count('skipped')} fanns redan</Badge>
              <Badge variant="outline" className="status-badge-denied">{count('error')} fel</Badge>
            </div>
            {count('created') > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <div className="space-y-2">
                  <p><strong>{t('Lösenorden visas bara nu.')}</strong> {t('Ladda ner resultatfilen och lämna lösenorden till respektive person på ett säkert sätt.')}</p>
                  <Button size="sm" onClick={() => download('anvandarimport-resultat.csv', toCsv(
                    results.map(r => ({ rad: String(r.row), email: r.email, status: STATUS[r.status].label, meddelande: r.message || '', tillfalligt_losenord: r.temp_password || '' })),
                    ['rad', 'email', 'status', 'meddelande', 'tillfalligt_losenord'],
                  ))}>
                    <Download className="mr-2 h-4 w-4" />{t('Ladda ner resultat med lösenord')}
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader><TableRow><TableHead>{t('Rad')}</TableHead><TableHead>{t('E-post')}</TableHead><TableHead>{t('Resultat')}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.email || '–'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS[r.status].className}>{STATUS[r.status].label}</Badge>
                        {r.message && <span className="ml-2 text-xs text-muted-foreground">{r.message}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={() => close(false)}>{t('Klar')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>{t('Avbryt')}</Button>
              <Button onClick={runImport} disabled={busy || rows.length === 0}>{busy ? t('Importerar…') : t('Importera {v0} användare', { v0: rows.length || '' }).replace('  ', ' ')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
