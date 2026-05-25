import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useBranding } from '@/context/BrandingContext';
import * as api from '@/services/api';

export default function ForgotPasswordPage() {
  const { appName, logoUrl } = useBranding();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } catch { /* ignore — generic response */ }
    setSubmitted(true);
    setLoading(false);
  };

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
            <CardTitle className="text-2xl">Återställ lösenord</CardTitle>
            <CardDescription className="mt-1">
              Vi skickar en återställningslänk till din e-post.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-sm">
              <p>
                Om e-postadressen finns i systemet skickas en återställningslänk
                inom kort. Kontrollera även skräpposten.
              </p>
              <Link to="/" className="block text-center text-primary hover:underline">
                Tillbaka till inloggning
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="din@epost.se"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Skickar...' : 'Skicka återställningslänk'}
              </Button>
              <div className="text-center text-sm">
                <Link to="/" className="text-primary hover:underline">
                  Tillbaka till inloggning
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
