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
import { useBranding } from '@/context/BrandingContext';
import { toast } from 'sonner';
import type { Requirement } from '@/types/rbac';
import * as store from '@/services/dataStore';
import * as api from '@/services/api';

const TYPE_LABELS: Record<string, string> = { certification: 'Certifiering', clearance: 'Säkerhetsprövning', training: 'Utbildning' };
const TYPE_ICONS: Record<string, typeof Award> = { certification: Award, clearance: Lock, training: Shield };

interface SystemSettings {
  branding?: { appName?: string; subtitle?: string; primaryColor?: string; logoUrl?: string };
  notifications?: { expiryWarningDays?: number[]; emailEnabled?: boolean; warning30?: boolean; warning7?: boolean; warning1?: boolean };
  security?: { sessionTimeoutMinutes?: number; maxLoginAttempts?: number; twoFactorRequired?: boolean };
  general?: { organizationName?: string; language?: string; selfRegistration?: boolean };
  auth?: { localEnabled?: boolean; entraEnabled?: boolean; entraTenantId?: string; entraClientId?: string; samlEnabled?: boolean };
}

const DEFAULT_SETTINGS: SystemSettings = {
  branding: { appName: 'RBAC Access', subtitle: 'Tillträdeshantering', primaryColor: '#2563eb', logoUrl: '' },
  notifications: { emailEnabled: false, warning30: true, warning7: true, warning1: true, expiryWarningDays: [30, 7, 1] },
  security: { sessionTimeoutMinutes: 30, maxLoginAttempts: 5, twoFactorRequired: false },
  general: { organizationName: 'Företaget AB', language: 'Svenska', selfRegistration: false },
  auth: { localEnabled: true, entraEnabled: false, entraTenantId: '', entraClientId: '', samlEnabled: false },
};

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const { refresh: refreshBranding } = useBranding();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [editReq, setEditReq] = useState<Requirement | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  const [reqName, setReqName] = useState('');
  const [reqDescription, setReqDescription] = useState('');
  const [reqType, setReqType] = useState<Requirement['type']>('training');
  const [reqHasExpiry, setReqHasExpiry] = useState(false);
  const [reqValidityDays, setReqValidityDays] = useState(365);

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
      if (s.general) merged.general = { ...DEFAULT_SETTINGS.general!, ...s.general };
      if (s.auth) merged.auth = { ...DEFAULT_SETTINGS.auth!, ...s.auth };
      setSettings(merged);
      setSettingsLoaded(true);
    }).catch(() => {
      setSettingsLoaded(true);
    });
  }, []);

  const handleSaveSettings = async () => {
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
      if (settings.general) toSave.general = settings.general;
      if (settings.auth) toSave.auth = settings.auth;
      await store.saveSettings(toSave as store.SystemSettings);
      await refreshBranding();
      toast.success('Inställningar sparade');
    } catch (err) {
      toast.error('Kunde inte spara inställningar');
    } finally {
      setSaving(false);
    }
  };

  const openCreateReq = () => {
    setEditReq(null); setReqName(''); setReqDescription(''); setReqType('training'); setReqHasExpiry(false); setReqValidityDays(365);
    setReqDialogOpen(true);
  };

  const openEditReq = (r: Requirement) => {
    setEditReq(r); setReqName(r.name); setReqDescription(r.description); setReqType(r.type); setReqHasExpiry(r.has_expiry); setReqValidityDays(r.validity_days || 365);
    setReqDialogOpen(true);
  };

  const handleSaveReq = async () => {
    if (!reqName.trim()) { toast.error('Ange namn på kravet'); return; }
    if (editReq) {
      await store.updateRequirement(editReq.id, { name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
      toast.success('Krav uppdaterat');
    } else {
      await store.createRequirement({ name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
      if (currentUser) {
        await store.addLog({ action: 'requirement_created', actor_id: currentUser.id, details: `Nytt krav skapat: ${reqName}` });
      }
      toast.success('Krav skapat');
    }
    setReqDialogOpen(false); reload();
  };

  const handleDeleteReq = async (r: Requirement) => {
    if (confirm(`Ta bort kravet "${r.name}"?`)) {
      await store.deleteRequirement(r.id);
      toast.success('Krav borttaget'); reload();
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, updater: Partial<SystemSettings[K]>) => {
    setSettings(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...updater } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inställningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Systemkonfiguration, branding och kravhantering</p>
        </div>
        {settingsLoaded && (
          <Button onClick={handleSaveSettings} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Sparar...' : 'Spara inställningar'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Allmänt</TabsTrigger>
          <TabsTrigger value="requirements">Krav</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="notifications">Aviseringar</TabsTrigger>
          <TabsTrigger value="auth">Autentisering</TabsTrigger>
          {currentUser?.roles?.includes('administrator') && (
            <TabsTrigger value="system">System</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Allmänna inställningar
              </CardTitle>
              <CardDescription>Grundläggande systemkonfiguration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Organisationsnamn</Label>
                  <Input
                    value={settings.general?.organizationName || ''}
                    onChange={e => updateSetting('general', { organizationName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Systemspråk</Label>
                  <Input value="Svenska" disabled />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Tillåt självregistrering för entreprenörer</p>
                  <p className="text-xs text-muted-foreground">Entreprenörer kan registrera sig via ett publikt formulär</p>
                </div>
                <Switch
                  checked={settings.general?.selfRegistration || false}
                  onCheckedChange={v => updateSetting('general', { selfRegistration: v })}
                />
              </div>
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">Kräv tvåfaktorsautentisering</p>
                  <p className="text-xs text-muted-foreground">Kommer i en framtida version</p>
                </div>
                <Switch checked={false} disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          <RequirementsTab
            reqDialogOpen={reqDialogOpen}
            setReqDialogOpen={setReqDialogOpen}
            openCreateReq={openCreateReq}
            openEditReq={openEditReq}
            handleDeleteReq={handleDeleteReq}
            reqName={reqName} setReqName={setReqName}
            reqDescription={reqDescription} setReqDescription={setReqDescription}
            reqType={reqType} setReqType={setReqType}
            reqHasExpiry={reqHasExpiry} setReqHasExpiry={setReqHasExpiry}
            reqValidityDays={reqValidityDays} setReqValidityDays={setReqValidityDays}
            handleSaveReq={handleSaveReq}
            editReq={editReq}
          />
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Branding
              </CardTitle>
              <CardDescription>Anpassa logotyp och utseende</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Logotyp (URL)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={settings.branding?.logoUrl || ''}
                    onChange={e => updateSetting('branding', { logoUrl: e.target.value })}
                  />
                  {settings.branding?.logoUrl && (
                    <img
                      src={settings.branding.logoUrl}
                      alt="Förhandsvisning"
                      className="h-10 w-10 rounded-lg border object-contain bg-background"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Ange en URL till en bild. Visas i sidebar och på inloggningssidan.</p>
              </div>
              <div className="space-y-2">
                <Label>Applikationsnamn</Label>
                <Input
                  value={settings.branding?.appName || ''}
                  onChange={e => updateSetting('branding', { appName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Undertitel</Label>
                <Input
                  value={settings.branding?.subtitle || ''}
                  onChange={e => updateSetting('branding', { subtitle: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Primärfärg</Label>
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
              <CardTitle className="text-base">Aviseringsinställningar</CardTitle>
              <CardDescription>Konfigurera när aviseringar skickas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Påminnelse 30 dagar före utgång</p>
                  <p className="text-xs text-muted-foreground">Skicka till sökande, chef och anläggningsägare</p>
                </div>
                <Switch
                  checked={settings.notifications?.warning30 || false}
                  onCheckedChange={v => updateSetting('notifications', { warning30: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Påminnelse 7 dagar före utgång</p>
                  <p className="text-xs text-muted-foreground">Skicka till sökande, chef och anläggningsägare</p>
                </div>
                <Switch
                  checked={settings.notifications?.warning7 || false}
                  onCheckedChange={v => updateSetting('notifications', { warning7: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Påminnelse 1 dag före utgång</p>
                  <p className="text-xs text-muted-foreground">Skicka till sökande, chef och anläggningsägare</p>
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
                  <p className="text-xs text-muted-foreground">Skicka aviseringar via e-post utöver i appen</p>
                </div>
                <Switch
                  checked={settings.notifications?.emailEnabled || false}
                  onCheckedChange={v => updateSetting('notifications', { emailEnabled: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Autentisering
              </CardTitle>
              <CardDescription>Konfigurera inloggningsmetoder</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Lokala inloggningsuppgifter</p>
                  <p className="text-xs text-muted-foreground">Användarnamn och lösenord</p>
                </div>
                <Switch
                  checked={settings.auth?.localEnabled !== false}
                  onCheckedChange={v => updateSetting('auth', { localEnabled: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">Entra ID / Azure AD (OIDC)</p>
                  <p className="text-xs text-muted-foreground">Single Sign-On via Microsoft — kommer i en framtida version</p>
                </div>
                <Switch checked={false} disabled />
              </div>
              <Separator />
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-foreground">SAML 2.0</p>
                  <p className="text-xs text-muted-foreground">SAML-baserad federerad inloggning — kommer i en framtida version</p>
                </div>
                <Switch checked={false} disabled />
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

      <Dialog open={reqDialogOpen} onOpenChange={setReqDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editReq ? 'Redigera krav' : 'Nytt krav'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Namn *</Label><Input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="t.ex. Heta arbeten" /></div>
            <div className="space-y-2"><Label>Beskrivning</Label><Textarea value={reqDescription} onChange={e => setReqDescription(e.target.value)} placeholder="Beskriv kravet..." /></div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={reqType} onValueChange={v => setReqType(v as Requirement['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Utbildning</SelectItem>
                  <SelectItem value="certification">Certifiering</SelectItem>
                  <SelectItem value="clearance">Säkerhetsprövning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Har giltighetstid</Label>
              <Switch checked={reqHasExpiry} onCheckedChange={setReqHasExpiry} />
            </div>
            {reqHasExpiry && (
              <div className="space-y-2">
                <Label>Giltighetstid (dagar)</Label>
                <Input type="number" value={reqValidityDays} onChange={e => setReqValidityDays(parseInt(e.target.value) || 0)} min={1} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveReq}>{editReq ? 'Spara' : 'Skapa krav'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequirementsTab({ reqDialogOpen, setReqDialogOpen, openCreateReq, openEditReq, handleDeleteReq, reqName, setReqName, reqDescription, setReqDescription, reqType, setReqType, reqHasExpiry, setReqHasExpiry, reqValidityDays, setReqValidityDays, handleSaveReq, editReq }: {
  reqDialogOpen: boolean; setReqDialogOpen: (v: boolean) => void;
  openCreateReq: () => void; openEditReq: (r: Requirement) => void; handleDeleteReq: (r: Requirement) => void;
  reqName: string; setReqName: (v: string) => void;
  reqDescription: string; setReqDescription: (v: string) => void;
  reqType: Requirement['type']; setReqType: (v: Requirement['type']) => void;
  reqHasExpiry: boolean; setReqHasExpiry: (v: boolean) => void;
  reqValidityDays: number; setReqValidityDays: (v: number) => void;
  handleSaveReq: () => void; editReq: Requirement | null;
}) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reqs = store.getRequirements();
    setRequirements(reqs);
    setLoading(false);
  }, []);

  const handleSave = async () => {
    if (!reqName.trim()) { toast.error('Ange namn på kravet'); return; }
    try {
      if (editReq) {
        await store.updateRequirement(editReq.id, { name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
        setRequirements(prev => prev.map(r => r.id === editReq.id ? { ...r, name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined } : r));
        toast.success('Krav uppdaterat');
      } else {
        const created = await store.createRequirement({ name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
        setRequirements(prev => [...prev, created]);
        toast.success('Krav skapat');
      }
      setReqDialogOpen(false);
    } catch {
      toast.error('Kunde inte spara krav');
    }
  };

  const handleDelete = async (r: Requirement) => {
    if (!confirm(`Ta bort kravet "${r.name}"?`)) return;
    try {
      await store.deleteRequirement(r.id);
      setRequirements(prev => prev.filter(x => x.id !== r.id));
      toast.success('Krav borttaget');
    } catch {
      toast.error('Kunde inte ta bort krav');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Krav och kvalifikationer
            </CardTitle>
            <CardDescription>Hantera certifieringar, utbildningar och säkerhetsprövningar</CardDescription>
          </div>
          <Button size="sm" onClick={openCreateReq}><Plus className="mr-2 h-4 w-4" />Nytt krav</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><span className="text-muted-foreground">Laddar...</span></div>
        ) : requirements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inga krav definierade ännu</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Lägg till utbildningar, certifieringar och säkerhetsprövningar som kan kopplas till anläggningar och områden</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Krav</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead>Giltighetstid</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map(req => {
                const Icon = TYPE_ICONS[req.type] || Shield;
                return (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium">{req.name}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{TYPE_LABELS[req.type]}</Badge></TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{req.description || '–'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.has_expiry ? <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.validity_days} dagar</div> : 'Permanent'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditReq(req)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(req)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-destructive'}`}
      aria-label={ok ? 'OK' : 'Fel'}
    />
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Aldrig';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return new Date(iso).toLocaleString('sv-SE');
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s} s sedan`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h sedan`;
  return new Date(iso).toLocaleString('sv-SE');
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
    } catch (e: any) {
      setError(e?.message || 'Kunde inte hämta systemstatus');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerExpiry = async () => {
    setRunning(true);
    try {
      await api.runExpiryJobNow();
      toast.success('Expiry-jobbet kördes');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte köra expiry-jobbet');
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
                Systemstatus
              </CardTitle>
              <CardDescription>Drift, integrationer och bakgrundsjobb</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!status ? (
            <p className="text-sm text-muted-foreground">{loading ? 'Laddar...' : '–'}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Databas
                  <span className="ml-auto"><StatusDot ok={status.db.ok} /></span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {status.db.ok ? `Svarstid: ${status.db.latencyMs} ms` : status.db.error || 'Otillgänglig'}
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
                    <p>Status: {status.email.verified ? 'Verifierad' : 'Ej verifierad'}</p>
                    {status.email.lastError && <p className="text-destructive">Fel: {status.email.lastError}</p>}
                    <p>Senast skickat: {formatRelative(status.email.lastSentAt)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">SMTP är inte konfigurerat (sätt SMTP_HOST).</p>
                )}
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  Server
                  <span className="ml-auto"><StatusDot ok={true} /></span>
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>Node {status.server.nodeVersion} ({status.server.env})</p>
                  <p>Uptime: {Math.floor(status.server.uptimeSeconds / 3600)}h {Math.floor((status.server.uptimeSeconds % 3600) / 60)}m</p>
                  {status.server.version && <p>Version: {status.server.version}</p>}
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
                  Bakgrundsjobb: utgångskontroll
                </CardTitle>
                <CardDescription>Markerar utgångna ansökningar/krav och skickar förvarningar</CardDescription>
              </div>
              <Button size="sm" onClick={triggerExpiry} disabled={running}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {running ? 'Kör...' : 'Kör nu'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={status.expiryJob.enabled ? 'secondary' : 'outline'}>
                  {status.expiryJob.enabled ? 'Aktiverat' : 'Avstängt'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Intervall:</span>{' '}
                {status.expiryJob.intervalMs ? `${Math.round(status.expiryJob.intervalMs / 60000)} min` : '–'}
              </div>
              <div>
                <span className="text-muted-foreground">Senaste körning:</span>{' '}
                {formatRelative(status.expiryJob.lastRunAt)}
              </div>
              <div>
                <span className="text-muted-foreground">Senaste längd:</span>{' '}
                {status.expiryJob.lastDurationMs != null ? `${status.expiryJob.lastDurationMs} ms` : '–'}
              </div>
              <div>
                <span className="text-muted-foreground">Antal körningar:</span> {status.expiryJob.totalRuns}
              </div>
            </div>
            {status.expiryJob.lastResult && (
              <div className="mt-2 rounded-md bg-muted/40 p-3 text-xs">
                <p className="font-medium mb-1">Senaste resultat</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <span>Utgångna ansökningar: <strong>{status.expiryJob.lastResult.expiredApps}</strong></span>
                  <span>Utgångna krav: <strong>{status.expiryJob.lastResult.expiredReqs}</strong></span>
                  <span>Varningar (ansökan): <strong>{status.expiryJob.lastResult.warnApps}</strong></span>
                  <span>Varningar (krav): <strong>{status.expiryJob.lastResult.warnReqs}</strong></span>
                </div>
              </div>
            )}
            {status.expiryJob.lastError && (
              <p className="text-sm text-destructive">Senaste fel: {status.expiryJob.lastError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
