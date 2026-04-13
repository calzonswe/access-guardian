import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';

export default function ChangePasswordPage() {
  const { changePassword, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Lösenorden matchar inte');
      return;
    }
    if (newPassword.length < 8) {
      setError('Lösenordet måste vara minst 8 tecken');
      return;
    }

    try {
      await changePassword(newPassword);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ändra lösenord');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-warning/20">
              <Shield className="h-7 w-7 text-warning" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl">Byt lösenord</CardTitle>
            <CardDescription>Du måste byta ditt lösenord innan du kan fortsätta</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nytt lösenord</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                autoFocus
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Bekräfta lösenord</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">Byt lösenord</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={logout}>
              Logga ut
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
