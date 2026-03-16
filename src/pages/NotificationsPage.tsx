import { useState } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as store from '@/services/dataStore';
import { useAuth } from '@/context/AuthContext';

const TYPE_CONFIG: Record<string, { icon: typeof Bell; className: string; label: string }> = {
  info: { icon: Info, className: 'text-primary', label: 'Information' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Varning' },
  action_required: { icon: Bell, className: 'text-destructive', label: 'Åtgärd krävs' },
};

export default function NotificationsPage() {
  const { currentUser } = useAuth();
  const [, setRefresh] = useState(0);
  if (!currentUser) return null;

  const notifications = store.getNotifications(currentUser.id);
  const unread = notifications.filter(n => !n.read);

  const markAllRead = () => {
    store.markAllNotificationsRead(currentUser.id);
    setRefresh(n => n + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Aviseringar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unread.length > 0 ? `${unread.length} olästa aviseringar` : 'Inga olästa aviseringar'}
          </p>
        </div>
        {unread.length > 0 && <Button variant="outline" size="sm" onClick={markAllRead}>Markera alla som lästa</Button>}
      </div>
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Inga aviseringar</p>
            </CardContent>
          </Card>
        ) : (
          notifications.map(notif => {
            const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
            const Icon = config.icon;
            return (
              <Card key={notif.id} className={`transition-colors ${!notif.read ? 'border-primary/30 bg-primary/5' : ''}`}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={`mt-0.5 ${config.className}`}><Icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{notif.title}</p>
                      {!notif.read && <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">Ny</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{new Date(notif.created_at).toLocaleString('sv-SE')}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{config.label}</Badge>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
