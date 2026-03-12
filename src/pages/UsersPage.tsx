import { Users, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MOCK_USERS } from '@/data/mock-data';
import { ROLE_LABELS } from '@/types/rbac';

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Användare</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera användare och roller</p>
        </div>
        <Button><Plus className="mr-2 h-4 w-4" />Ny användare</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Roller</TableHead>
                <TableHead>Avdelning</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_USERS.map(user => (
                <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(r => (
                        <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r]}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.department || user.company || '–'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={user.is_active ? 'status-badge-approved' : 'status-badge-denied'}>
                      {user.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
