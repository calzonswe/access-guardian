import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useBranding } from '@/context/BrandingContext';
import * as api from '@/services/api';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const { appName, logoUrl } = useBranding();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (password.length < 8) return 'Lösenordet måste vara minst 8 tecken';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return 'Lösenordet måste innehålla stora och små bokstäver, siffror och specialtecken';
    }
    if (password !== confirm) return 'Lösenorden matchar inte';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      toast.success('Lösenordet har återställts. Logga in med det nya lösenordet.');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Kunde inte återställa lösenordet');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Ogiltig länk</CardTitle>
            <CardDescription>Återställningslänken saknar token.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password" className="text-primary hover:underline">
              Begär ny återställningslänk
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="h-14 w-14 rounded-xl object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                <Shield className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
          </div>
          <div>
            <CardTitle className="text-2xl">Välj nytt lösenord</CardTitle>
            <CardDescription className="mt-1">
              Minst 8 tecken, med stor/liten bokstav, siffra och specialtecken.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Nytt lösenord</Label>
              <Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Bekräfta lösenord</Label>
              <Input id="pw2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Återställer...' : 'Återställ lösenord'}
            </Button>
            <div className="text-center text-sm">
              <Link to="/" className="text-primary hover:underline">Tillbaka till inloggning</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
