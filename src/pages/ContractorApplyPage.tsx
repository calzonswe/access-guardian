import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Paperclip, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useBranding } from '@/context/BrandingContext';
import { errorMessage } from '@/lib/utils';
import { t } from '@/i18n';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';

interface PublicFacility { id: string; name: string; description?: string; address?: string }
interface PublicArea { id: string; facility_id: string; name: string; security_level: string }

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SECURITY_LABELS: Record<string, string> = { low: t('Låg'), medium: t('Medel'), high: t('Hög'), critical: t('Kritisk') };

export default function ContractorApplyPage() {
  const { appName, logoUrl } = useBranding();
  const fileRef = useRef<HTMLInputElement>(null);

  const [facilities, setFacilities] = useState<PublicFacility[]>([]);
  const [areas, setAreas] = useState<PublicArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ tempPassword: string | null; message: string } | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [justification, setJustification] = useState('');
  const [files, setFiles] = useState<{ name: string; data: string; mime: string }[]>([]);
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const loadCaptcha = () => {
    fetch(`${API_BASE}/contractor/captcha`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.token) { setCaptcha(d); setCaptchaAnswer(''); } })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`${API_BASE}/contractor/facilities`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(t('Kunde inte hämta anläggningar'))))
      .then(d => { setFacilities(d.facilities || []); setAreas(d.areas || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    loadCaptcha();
  }, []);

  const facilityAreas = areas.filter(a => a.facility_id === facilityId);

  const toggleArea = (id: string) =>
    setSelectedAreas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl) return;
    const out: typeof files = [];
    for (const f of Array.from(fl)) {
      if (f.size > 10 * 1024 * 1024) { setError(t('{name} är för stor (max 10 MB)', { name: f.name })); continue; }
      const data = await new Promise<string>(res => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(f);
      });
      out.push({ name: f.name, data, mime: f.type });
    }
    setFiles(p => [...p, ...out].slice(0, 8));
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        first_name: firstName.trim(), last_name: lastName.trim(),
        email: email.trim(), phone: phone.trim(), company: company.trim(),
        sponsor_email: sponsorEmail.trim(),
        facility_id: facilityId, area_ids: selectedAreas,
        start_date: startDate, end_date: endDate || null,
        justification: justification.trim(),
        attachments: files.map(f => ({
          file_name: f.name,
          file_data: f.data.replace(/^data:[^;]+;base64,/, ''),
          mime_type: f.mime,
        })),
        captcha_token: captcha?.token,
        captcha_answer: captchaAnswer.trim(),
      };
      const res = await fetch(`${API_BASE}/contractor/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        loadCaptcha(); // captcha is one-time use, refresh on any failure
        throw new Error(body.error || t('Något gick fel'));
      }
      setSuccess({ tempPassword: body.temp_password || null, message: body.message || t('Ansökan mottagen.') });
    } catch (err) {
      setError(errorMessage(err, t('Något gick fel')));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </div>
            <CardTitle>{t('Ansökan inskickad')}</CardTitle>
            <CardDescription>{success.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {success.tempPassword && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-2">
                <p className="text-sm font-medium">{t('Tillfälligt lösenord (visas endast en gång)')}</p>
                <code className="block rounded bg-background p-2 text-sm font-mono break-all">{success.tempPassword}</code>
                <p className="text-xs text-muted-foreground">
                  {t('Logga in med din e-post och detta lösenord. Du tvingas byta lösenord vid första inloggningen.')}
                </p>
              </div>
            )}
            <Button className="w-full" onClick={() => { window.location.href = '/'; }}>{t('Till inloggning')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-center mb-8 space-y-3">
          <div className="flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="h-14 w-14 rounded-xl object-contain" />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
                <Shield className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
          </div>
          <h1 className="text-2xl font-semibold">{t('Entreprenörsansökan')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('Ansök om tillträde som extern entreprenör. Din kontaktperson hos')} {appName} {t('måste godkänna ansökan.')}
          </p>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">{t('Laddar...')}</p>
        ) : (
          <>
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>{t('Förnamn *')}</Label><Input required value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={128} /></div>
                  <div className="space-y-2"><Label>{t('Efternamn *')}</Label><Input required value={lastName} onChange={e => setLastName(e.target.value)} maxLength={128} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>{t('E-post *')}</Label><Input required type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} /></div>
                  <div className="space-y-2"><Label>{t('Telefon')}</Label><Input value={phone} onChange={e => setPhone(e.target.value)} maxLength={50} /></div>
                </div>
                <div className="space-y-2"><Label>{t('Företag *')}</Label><Input required value={company} onChange={e => setCompany(e.target.value)} maxLength={255} /></div>

                <div className="space-y-2">
                  <Label>{t('Kontaktperson hos {appName} (e-post) *', { appName })}</Label>
                  <Input required type="email" value={sponsorEmail} onChange={e => setSponsorEmail(e.target.value)} maxLength={255} />
                  <p className="text-xs text-muted-foreground">{t('Personen som har bjudit in dig och som ansvarar för ditt uppdrag.')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('Anläggning *')}</Label>
                  <Select value={facilityId} onValueChange={v => { setFacilityId(v); setSelectedAreas([]); }}>
                    <SelectTrigger><SelectValue placeholder={t('Välj anläggning')} /></SelectTrigger>
                    <SelectContent>{facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {facilityId && facilityAreas.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('Områden (valfritt)')}</Label>
                    <div className="space-y-2 rounded-lg border border-border p-3 max-h-48 overflow-y-auto">
                      {facilityAreas.map(a => (
                        <div key={a.id} className="flex items-center gap-2">
                          <Checkbox checked={selectedAreas.includes(a.id)} onCheckedChange={() => toggleArea(a.id)} />
                          <span className="text-sm">{a.name}</span>
                          <Badge variant="outline" className="text-xs ml-auto">{SECURITY_LABELS[a.security_level] || a.security_level}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>{t('Startdatum *')}</Label><Input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('Slutdatum')}</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                </div>

                <div className="space-y-2">
                  <Label>{t('Motivering / kommentar')}</Label>
                  <Textarea
                    placeholder={t('Beskriv kort uppdraget. Om du saknar krav (t.ex. utbildning) – motivera varför undantag bör beviljas.')}
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                    maxLength={2000}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('Bilagor (max 8 filer, 10 MB / fil)')}</Label>
                  {files.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-border p-2">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.txt,.csv" onChange={onFiles} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="mr-2 h-4 w-4" />{t('Lägg till bilagor')}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>{t('Säkerhetskontroll *')}</Label>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm select-none">
                      {captcha ? `${captcha.question} = ?` : '...'}
                    </div>
                    <Input
                      required
                      inputMode="numeric"
                      placeholder={t('Svar')}
                      value={captchaAnswer}
                      onChange={e => setCaptchaAnswer(e.target.value)}
                      className="max-w-[120px]"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={loadCaptcha}>{t('Nytt')}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('Lös uppgiften för att bevisa att du inte är en bot.')}</p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex items-center justify-between pt-2">
                  <a href="/" className="text-sm text-muted-foreground hover:text-foreground">{t('← Tillbaka till inloggning')}</a>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? t('Skickar...') : t('Skicka ansökan')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <LanguageSwitch className="mt-4" />
          </>
        )}
      </div>
    </div>
  );
}
