import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import * as api from '@/services/api';
import * as store from '@/services/dataStore';
import { errorMessage } from '@/lib/utils';
import { t, getLanguage, setLanguage, type Language } from '@/i18n';
import type { User } from '@/types/rbac';

type Prefs = { action?: boolean; status?: boolean; expiry?: boolean };
const CATEGORIES: { key: keyof Prefs; label: string; help: string }[] = [
  { key: 'action', label: t('Ansökningar som väntar på mitt beslut'), help: t('Nya ansökningar att godkänna, påminnelser och eskaleringar') },
  { key: 'status', label: t('Beslut om mina ansökningar'), help: t('När dina ansökningar godkänns, nekas eller återkallas') },
  { key: 'expiry', label: t('Påminnelser om utgång'), help: t('När ditt tillträde eller dina krav snart går ut') },
];

/** Language and e-mail notification settings on the profile page. */
export function LanguageAndEmailCard({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(user.email_prefs || {});
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const apiMode = store.isApiMode();

  useEffect(() => {
    if (!apiMode) return;
    api.getBranding().then(b => setEmailAvailable(b.emailAvailable !== false)).catch(() => setEmailAvailable(null));
  }, [apiMode]);

  const changeLanguage = async (lang: Language) => {
    try {
      if (apiMode) await store.updateOwnProfile(user.id, { language: lang });
      setLanguage(lang); // reloads the page in the new language
    } catch (err) {
      toast.error(errorMessage(err, t('Språket kunde inte sparas')));
    }
  };

  const togglePref = async (key: keyof Prefs, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    try {
      await store.updateOwnProfile(user.id, { email_prefs: next });
      toast.success(t('E-postinställningar sparade'));
      onSaved();
    } catch (err) {
      setPrefs(prefs);
      toast.error(errorMessage(err, t('E-postinställningarna kunde inte sparas')));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Languages className="h-4 w-4" />{t('Språk och e-post')}</CardTitle>
        <CardDescription>{t('Gäller appen, aviseringar och e-post till dig.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="profile-language">{t('Språk')}</Label>
          <Select value={getLanguage()} onValueChange={v => changeLanguage(v as Language)}>
            <SelectTrigger id="profile-language"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sv" lang="sv">Svenska</SelectItem>
              <SelectItem value="en" lang="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {apiMode && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t('E-postaviseringar')}</p>
              <p className="text-xs text-muted-foreground">
                {emailAvailable === false
                  ? t('E-post skickas inte från systemet just nu. Du får alla aviseringar i appen.')
                  : t('Aviseringar i appen visas alltid. Lösenordsåterställning skickas alltid via e-post.')}
              </p>
            </div>
            {CATEGORIES.map(c => (
              <div key={c.key} className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`pref-${c.key}`} className="text-sm">{c.label}</Label>
                  <p className="text-xs text-muted-foreground">{c.help}</p>
                </div>
                <Switch
                  id={`pref-${c.key}`}
                  checked={prefs[c.key] !== false}
                  disabled={emailAvailable === false}
                  onCheckedChange={v => togglePref(c.key, v)}
                />
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
