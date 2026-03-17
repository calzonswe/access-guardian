import { useState } from 'react';
import { Palette, Shield, Globe, Plus, Pencil, Trash2, Clock, Award, Lock } from 'lucide-react';
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
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Requirement } from '@/types/rbac';

const TYPE_LABELS: Record<string, string> = { certification: 'Certifiering', clearance: 'Säkerhetsprövning', training: 'Utbildning' };
const TYPE_ICONS: Record<string, typeof Award> = { certification: Award, clearance: Lock, training: Shield };

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [editReq, setEditReq] = useState<Requirement | null>(null);
  const [, setRefresh] = useState(0);
  const reload = () => setRefresh(n => n + 1);

  // Requirement form state
  const [reqName, setReqName] = useState('');
  const [reqDescription, setReqDescription] = useState('');
  const [reqType, setReqType] = useState<Requirement['type']>('training');
  const [reqHasExpiry, setReqHasExpiry] = useState(false);
  const [reqValidityDays, setReqValidityDays] = useState(365);

  const requirements = store.getRequirements();

  const openCreateReq = () => {
    setEditReq(null); setReqName(''); setReqDescription(''); setReqType('training'); setReqHasExpiry(false); setReqValidityDays(365);
    setReqDialogOpen(true);
  };

  const openEditReq = (r: Requirement) => {
    setEditReq(r); setReqName(r.name); setReqDescription(r.description); setReqType(r.type); setReqHasExpiry(r.has_expiry); setReqValidityDays(r.validity_days || 365);
    setReqDialogOpen(true);
  };

  const handleSaveReq = () => {
    if (!reqName.trim()) { toast.error('Ange namn på kravet'); return; }
    if (editReq) {
      store.updateRequirement(editReq.id, { name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
      toast.success('Krav uppdaterat');
    } else {
      store.createRequirement({ name: reqName, description: reqDescription, type: reqType, has_expiry: reqHasExpiry, validity_days: reqHasExpiry ? reqValidityDays : undefined });
      if (currentUser) {
        store.addLog({ action: 'requirement_created', actor_id: currentUser.id, details: `Nytt krav skapat: ${reqName}` });
      }
      toast.success('Krav skapat');
    }
    setReqDialogOpen(false); reload();
  };

  const handleDeleteReq = (r: Requirement) => {
    if (confirm(`Ta bort kravet "${r.name}"?`)) {
      store.deleteRequirement(r.id);
      toast.success('Krav borttaget'); reload();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Inställningar</h1>
        <p className="text-sm text-muted-foreground mt-1">Systemkonfiguration, branding och kravhantering</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Allmänt</TabsTrigger>
          <TabsTrigger value="requirements">Krav</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="notifications">Aviseringar</TabsTrigger>
          <TabsTrigger value="auth">Autentisering</TabsTrigger>
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
                  <Input defaultValue="Företaget AB" />
                </div>
                <div className="space-y-2">
                  <Label>Systemspråk</Label>
                  <Input defaultValue="Svenska" disabled />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Tillåt självregistrering för entreprenörer</p>
                  <p className="text-xs text-muted-foreground">Entreprenörer kan registrera sig via ett publikt formulär</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Kräv tvåfaktorsautentisering</p>
                  <p className="text-xs text-muted-foreground">Alla användare måste använda 2FA</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
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
              {requirements.length === 0 ? (
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
                            {req.has_expiry ? (
                              <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.validity_days} dagar</div>
                            ) : 'Permanent'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditReq(req)}><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteReq(req)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
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
                <Label>Logotyp</Label>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                    <Shield className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <Button variant="outline" size="sm">Ladda upp logotyp</Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Primärfärg</Label>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded-md bg-primary" />
                    <Input defaultValue="#2563eb" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Applikationsnamn</Label>
                  <Input defaultValue="RBAC Access" />
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
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Påminnelse 7 dagar före utgång</p>
                  <p className="text-xs text-muted-foreground">Skicka till sökande, chef och anläggningsägare</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Påminnelse 1 dag före utgång</p>
                  <p className="text-xs text-muted-foreground">Skicka till sökande, chef och anläggningsägare</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">E-postnotifieringar</p>
                  <p className="text-xs text-muted-foreground">Skicka aviseringar via e-post utöver i appen</p>
                </div>
                <Switch />
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
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Entra ID / Azure AD (OIDC)</p>
                  <p className="text-xs text-muted-foreground">Single Sign-On via Microsoft</p>
                </div>
                <Switch />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 pl-4 border-l-2 border-border ml-2">
                <div className="space-y-2">
                  <Label>Tenant ID</Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">SAML 2.0</p>
                  <p className="text-xs text-muted-foreground">SAML-baserad federerad inloggning</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Requirements Dialog */}
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
