import { Settings, Palette, FileText, Shield, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Inställningar</h1>
        <p className="text-sm text-muted-foreground mt-1">Systemkonfiguration, branding och formuläranpassning</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Allmänt</TabsTrigger>
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
    </div>
  );
}
