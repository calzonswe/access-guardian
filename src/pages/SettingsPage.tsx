import { useState, useEffect } from 'react';
import { Palette, Shield, Globe, Plus, Pencil, Trash2, Clock, Award, Lock, Save, Activity, RefreshCw, PlayCircle, Database, Mail, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useBranding, isValidLogoUrl } from '@/context/BrandingContext';
import { toast } from 'sonner';
import type { Requirement } from '@/types/rbac';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';
import { errorMessage } from '@/lib/utils';
import { t, locale } from '@/i18n';

const TYPE_LABELS: Record<string, string> = { certification: t('Certifiering'), clearance: t('Säkerhetsprövning'), training: t('Utbildning') };
const TYPE_ICONS: Record<string, typeof Award> = { certification: Award, clearance: Lock, training: Shield };

interface SystemSettings {
  branding?: { appName?: string; subtitle?: string; primaryColor?: string; logoUrl?: string };
  notifications?: { expiryWarningDays?: number[]; emailEnabled?: boolean; warning30?: boolean; warning7?: boolean; warning1?: boolean; remindAfterDays?: number; escalateAfterDays?: number };
  security?: { sessionTimeoutMinutes?: number; maxLoginAttempts?: number; lockoutMinutes?: number; twoFactorRequired?: boolean };
  passwordPolicy?: { minLength?: number; requireUpper?: boolean; requireLower?: boolean; requireDigit?: boolean; requireSymbol?: boolean };
  general?: { organizationName?: string; language?: string; selfRegistration?: boolean };
  auth?: { localEnabled?: boolean; entraEnabled?: boolean; entraTenantId?: string; entraClientId?: string; samlEnabled?: boolean };
}

const DEFAULT_SETTINGS: SystemSettings = {
  branding: { appName: 'RBAC Access', subtitle: t('Tillträdeshantering'), primaryColor: '#2563eb', logoUrl: '' },
  notifications: { emailEnabled: true, warning30: true, warning7: true, warning1: true, expiryWarningDays: [30, 7, 1], remindAfterDays: 3, escalateAfterDays: 7 },
  security: { sessionTimeoutMinutes: 30, maxLoginAttempts: 5, lockoutMinutes: 15, twoFactorRequired: false },
  passwordPolicy: { minLength: 8, requireUpper: true, requireLower: true, requireDigit: true, requireSymbol: true },
  general: { organizationName: t('Företaget AB'), language: 'Svenska', selfRegistration: true },
  auth: { localEnabled: true, entraEnabled: false, entraTenantId: '', entraClientId: '', samlEnabled: false },
};

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const { refresh: refreshBranding } = useBranding();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    store.getSettings().then(s => {
      const merged = { ...DEFAULT_SETTINGS };
      if (s.branding) merged.branding = { ...DEFAULT_SETTINGS.branding!, ...s.branding };
      if (s.notifications) {
        const d = s.notifications.expiryWarningDays || [30, 7, 1];
        merged.notifications = {
          ...DEFAULT_SETTINGS.notifications!,
          ...s.notifications,
          warning30: d.includes(30),
          warning7: d.includes(7),
          warning1: d.includes(1),
        };
      }
      if (s.security) merged.security = { ...DEFAULT_SETTINGS.security!, ...s.security };
      if (s.passwordPolicy) merged.passwordPolicy = { ...DEFAULT_SETTINGS.passwordPolicy!, ...s.passwordPolicy };
      if (s.general) merged.general = { ...DEFAULT_SETTINGS.general!, ...s.general };
      if (s.auth) merged.auth = { ...DEFAULT_SETTINGS.auth!, ...s.auth };
      setSettings(merged);
      setSettingsLoaded(true);
    }).catch(() => {
      setSettingsLoaded(true);
    });
  }, []);

  const handleSaveSettings = async () => {
    const logo = settings.branding?.logoUrl?.trim();
    if (logo && !isValidLogoUrl(logo)) {
      toast.error(t('Logotypen måste vara en bild-URL som börjar med https:// (eller en sökväg som börjar med /)'));
      return;
    }
    setSaving(true);
    try {
      const toSave: Record<string, unknown> = {};
      if (settings.branding) toSave.branding = settings.branding;
      if (settings.notifications) {
        const days: number[] = [];
        if (settings.notifications.warning30) days.push(30);
        if (settings.notifications.warning7) days.push(7);
        if (settings.notifications.warning1) days.push(1);
        toSave.notifications = { ...settings.notifications, expiryWarningDays: days };
      }
      if (settings.security) toSave.security = settings.security;
      if (settings.passwordPolicy) toSave.passwordPolicy = settings.passwordPolicy;
      if (settings.general) toSave.general = settings.general;
      if (settings.auth) toSave.auth = settings.auth;
      await store.saveSettings(toSave as store.SystemSettings);
      await refreshBranding();
      toast.success(t('Inställningar sparade'));
    } catch (err) {
      toast.error(t('Kunde inte spara inställningar'));
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, updater: Partial<SystemSettings[K]>) => {
    setSettings(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...updater } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('Inställningar')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('Systemkonfiguration, branding och säkerhet (krav hanteras under Krav i menyn)')}</p>
        </div>
        {settingsLoaded && (
          <Button onClick={handleSaveSettings} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? t('Sparar...') : t('Spara inställningar')}
          </Button>
        )}
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">{t('Allmänt')}</TabsTrigger>
          <TabsTrigger value="branding">{t('Branding')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('Aviseringar')}</TabsTrigger>
          <TabsTrigger value="auth">{t('Autentisering')}</TabsTrigger>
          {currentUser?.roles?.includes('administrator') && (
            <TabsTrigger value="system">{t('System')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                {t('Allmänna inställningar')}
              </CardTitle>
              <CardDescription>{t('Grundläggande systemkonfiguration')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('Organisationsnamn')}</Label>
                  <Input
                    value={settings.general?.organizationName || ''}
                    onChange={e => updateSetting('general', { organizationName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('Systemspråk')}</Label>
                  <Input value="Svenska" disabled />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Tillåt självregistrering för entreprenörer')}</p>
                  <p className="text-xs text-muted-foreground">{t('Entreprenörer kan registrera sig via ett publikt formulär')}</p>
                </div>
                <Switch
                  checked={settings.general?.selfRegistration !== false}
                  onCheckedChange={v => updateSetting('general', { selfRegistration: v })}
                />
              </div>
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Kräv tvåfaktorsautentisering')}</p>
                  <p className="text-xs text-muted-foreground">{t('Kommer i en framtida version')}</p>
                </div>
                <Switch checked={false} disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                {t('Branding')}
              </CardTitle>
              <CardDescription>{t('Anpassa logotyp och utseende')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('Logotyp (URL)')}</Label>
                <div className="flex items-center gap-4">
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={settings.branding?.logoUrl || ''}
                    onChange={e => updateSetting('branding', { logoUrl: e.target.value })}
                  />
                  {settings.branding?.logoUrl && (
                    <img
                      src={settings.branding.logoUrl}
                      alt={t('Förhandsvisning')}
                      className="h-10 w-10 rounded-lg border object-contain bg-background"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('Ange en URL till en bild. Visas i sidebar och på inloggningssidan.')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('Applikationsnamn')}</Label>
                <Input
                  value={settings.branding?.appName || ''}
                  onChange={e => updateSetting('branding', { appName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Undertitel')}</Label>
                <Input
                  value={settings.branding?.subtitle || ''}
                  onChange={e => updateSetting('branding', { subtitle: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('Primärfärg')}</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      className="h-9 w-9 rounded-md border cursor-pointer"
                      value={settings.branding?.primaryColor || '#2563eb'}
                      onChange={e => updateSetting('branding', { primaryColor: e.target.value })}
                    />
                    <Input
                      className="font-mono text-sm"
                      value={settings.branding?.primaryColor || '#2563eb'}
                      onChange={e => updateSetting('branding', { primaryColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Aviseringsinställningar')}</CardTitle>
              <CardDescription>{t('Konfigurera när aviseringar skickas')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Påminnelse 30 dagar före utgång')}</p>
                  <p className="text-xs text-muted-foreground">{t('Skicka till sökande, chef och anläggningsägare')}</p>
                </div>
                <Switch
                  checked={settings.notifications?.warning30 || false}
                  onCheckedChange={v => updateSetting('notifications', { warning30: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Påminnelse 7 dagar före utgång')}</p>
                  <p className="text-xs text-muted-foreground">{t('Skicka till sökande, chef och anläggningsägare')}</p>
                </div>
                <Switch
                  checked={settings.notifications?.warning7 || false}
                  onCheckedChange={v => updateSetting('notifications', { warning7: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Påminnelse 1 dag före utgång')}</p>
                  <p className="text-xs text-muted-foreground">{t('Skicka till sökande, chef och anläggningsägare')}</p>
                </div>
                <Switch
                  checked={settings.notifications?.warning1 || false}
                  onCheckedChange={v => updateSetting('notifications', { warning1: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">E-postnotifieringar</p>
                  <p className="text-xs text-muted-foreground">{t('Skicka aviseringar via e-post utöver i appen. Kräver att SMTP är konfigurerat (se fliken System). Lösenordsåterställning skickas alltid.')}</p>
                </div>
                <Switch
                  checked={settings.notifications?.emailEnabled !== false}
                  onCheckedChange={v => updateSetting('notifications', { emailEnabled: v })}
                />
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-foreground">{t('Ansökningar som väntar på beslut')}</p>
                <p className="text-xs text-muted-foreground">{t('En påminnelse till beslutsfattarna, och sedan en eskalering till administratörerna. 0 stänger av.')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="remind-days">{t('Påminn efter (dagar)')}</Label>
                  <Input id="remind-days" type="number" min={0} max={90}
                    value={settings.notifications?.remindAfterDays ?? 3}
                    onChange={e => updateSetting('notifications', { remindAfterDays: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="escalate-days">{t('Eskalera efter (dagar)')}</Label>
                  <Input id="escalate-days" type="number" min={0} max={180}
                    value={settings.notifications?.escalateAfterDays ?? 7}
                    onChange={e => updateSetting('notifications', { escalateAfterDays: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {t('Autentisering')}
              </CardTitle>
              <CardDescription>{t('Konfigurera inloggningsmetoder')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Lokala inloggningsuppgifter')}</p>
                  <p className="text-xs text-muted-foreground">{t('Användarnamn och lösenord. Enda inloggningsmetoden just nu och kan därför inte stängas av.')}</p>
                </div>
                <Switch checked disabled />
              </div>
              <Separator />
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Entra ID / Azure AD (OIDC)')}</p>
                  <p className="text-xs text-muted-foreground">{t('Single Sign-On via Microsoft — kommer i en framtida version')}</p>
                </div>
                <Switch checked={false} disabled />
              </div>
              <Separator />
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">SAML 2.0</p>
                  <p className="text-xs text-muted-foreground">{t('SAML-baserad federerad inloggning — kommer i en framtida version')}</p>
                </div>
                <Switch checked={false} disabled />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                {t('Säkerhet och lösenordspolicy')}
              </CardTitle>
              <CardDescription>{t('Gäller vid nästa inloggning respektive nästa lösenordsbyte')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Sessionstid (minuter)')}</p>
                  <p className="text-xs text-muted-foreground">{t('Utloggning efter så här lång inaktivitet')}</p>
                </div>
                <Input type="number" min={5} max={1440}
                  value={settings.security?.sessionTimeoutMinutes ?? ''}
                  onChange={e => updateSetting('security', { sessionTimeoutMinutes: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Max misslyckade inloggningar')}</p>
                  <p className="text-xs text-muted-foreground">{t('Därefter låses kontot tillfälligt')}</p>
                </div>
                <Input type="number" min={3} max={50}
                  value={settings.security?.maxLoginAttempts ?? ''}
                  onChange={e => updateSetting('security', { maxLoginAttempts: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Spärrtid (minuter)')}</p>
                  <p className="text-xs text-muted-foreground">{t('Hur länge kontot är låst')}</p>
                </div>
                <Input type="number" min={1} max={1440}
                  value={settings.security?.lockoutMinutes ?? ''}
                  onChange={e => updateSetting('security', { lockoutMinutes: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <Separator />
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('Minsta lösenordslängd')}</p>
                  <p className="text-xs text-muted-foreground">{t('Mellan 6 och 128 tecken')}</p>
                </div>
                <Input type="number" min={6} max={128}
                  value={settings.passwordPolicy?.minLength ?? ''}
                  onChange={e => updateSetting('passwordPolicy', { minLength: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">{t('Kräv versal (A–Z)')}</p>
                <Switch checked={settings.passwordPolicy?.requireUpper !== false} onCheckedChange={v => updateSetting('passwordPolicy', { requireUpper: v })} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">{t('Kräv gemen (a–z)')}</p>
                <Switch checked={settings.passwordPolicy?.requireLower !== false} onCheckedChange={v => updateSetting('passwordPolicy', { requireLower: v })} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">{t('Kräv siffra')}</p>
                <Switch checked={settings.passwordPolicy?.requireDigit !== false} onCheckedChange={v => updateSetting('passwordPolicy', { requireDigit: v })} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">{t('Kräv specialtecken')}</p>
                <Switch checked={settings.passwordPolicy?.requireSymbol !== false} onCheckedChange={v => updateSetting('passwordPolicy', { requireSymbol: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {currentUser?.roles?.includes('administrator') && (
          <TabsContent value="system" className="space-y-4">
            <SystemStatusTab />
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-destructive'}`}
      aria-label={ok ? 'OK' : t('Fel')}
    />
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return t('Aldrig');
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return new Date(iso).toLocaleString(locale());
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s} s sedan`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h sedan`;
  return new Date(iso).toLocaleString(locale());
}

function SystemStatusTab() {
  const [status, setStatus] = useState<api.SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await api.getSystemStatus());
    } catch (e) {
      setError(errorMessage(e, t('Kunde inte hämta systemstatus')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerExpiry = async () => {
    setRunning(true);
    try {
      await api.runExpiryJobNow();
      toast.success(t('Expiry-jobbet kördes'));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t('Kunde inte köra expiry-jobbet')));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {t('Systemstatus')}
              </CardTitle>
              <CardDescription>Drift, integrationer och bakgrundsjobb</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('Uppdatera')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!status ? (
            <p className="text-sm text-muted-foreground">{loading ? t('Laddar...') : '–'}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {t('Databas')}
                  <span className="ml-auto"><StatusDot ok={status.db.ok} /></span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {status.db.ok ? t('Svarstid: {latencyMs} ms', { latencyMs: status.db.latencyMs }) : status.db.error || t('Otillgänglig')}
                </p>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  E-post (SMTP)
                  <span className="ml-auto">
                    <StatusDot ok={status.email.enabled && status.email.verified} />
                  </span>
                </div>
                {status.email.enabled ? (
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>{status.email.host}:{status.email.port}{status.email.secure ? ' (TLS)' : ''}</p>
                    <p>{t('Status:')} {status.email.verified ? t('Verifierad') : t('Ej verifierad')}</p>
                    {status.email.lastError && <p className="text-destructive">{t('Fel:')} {status.email.lastError}</p>}
                    <p>{t('Senast skickat:')} {formatRelative(status.email.lastSentAt)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('SMTP är inte konfigurerat (sätt SMTP_HOST).')}</p>
                )}
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  {t('Server')}
                  <span className="ml-auto"><StatusDot ok={true} /></span>
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>{t('Node')} {status.server.nodeVersion} ({status.server.env})</p>
                  <p>{t('Uptime:')} {Math.floor(status.server.uptimeSeconds / 3600)}h {Math.floor((status.server.uptimeSeconds % 3600) / 60)}m</p>
                  {status.server.version && <p>{t('Version:')} {status.server.version}</p>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {t('Bakgrundsjobb: utgångskontroll')}
                </CardTitle>
                <CardDescription>{t('Markerar utgångna ansökningar/krav och skickar förvarningar')}</CardDescription>
              </div>
              <Button size="sm" onClick={triggerExpiry} disabled={running}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {running ? t('Kör...') : t('Kör nu')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('Status:')}</span>
                <Badge variant={status.expiryJob.enabled ? 'secondary' : 'outline'}>
                  {status.expiryJob.enabled ? t('Aktiverat') : t('Avstängt')}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">{t('Intervall:')}</span>{' '}
                {status.expiryJob.intervalMs ? `${Math.round(status.expiryJob.intervalMs / 60000)} min` : '–'}
              </div>
              <div>
                <span className="text-muted-foreground">{t('Senaste körning:')}</span>{' '}
                {formatRelative(status.expiryJob.lastRunAt)}
              </div>
              <div>
                <span className="text-muted-foreground">{t('Senaste längd:')}</span>{' '}
                {status.expiryJob.lastDurationMs != null ? `${status.expiryJob.lastDurationMs} ms` : '–'}
              </div>
              <div>
                <span className="text-muted-foreground">{t('Antal körningar:')}</span> {status.expiryJob.totalRuns}
              </div>
            </div>
            {status.expiryJob.lastResult && (
              <div className="mt-2 rounded-md bg-muted/40 p-3 text-xs">
                <p className="font-medium mb-1">{t('Senaste resultat')}</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <span>{t('Utgångna ansökningar:')} <strong>{status.expiryJob.lastResult.expiredApps}</strong></span>
                  <span>{t('Utgångna krav:')} <strong>{status.expiryJob.lastResult.expiredReqs}</strong></span>
                  <span>{t('Varningar (ansökan):')} <strong>{status.expiryJob.lastResult.warnApps}</strong></span>
                  <span>{t('Varningar (krav):')} <strong>{status.expiryJob.lastResult.warnReqs}</strong></span>
                </div>
              </div>
            )}
            {status.expiryJob.lastError && (
              <p className="text-sm text-destructive">{t('Senaste fel:')} {status.expiryJob.lastError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
