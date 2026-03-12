import { Building2, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { MOCK_FACILITIES, MOCK_AREAS, MOCK_USERS } from '@/data/mock-data';
import { useAuth } from '@/context/AuthContext';

export default function FacilitiesPage() {
  const { activeRole } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Anläggningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera anläggningar och områden</p>
        </div>
        {activeRole === 'administrator' && (
          <Button><Plus className="mr-2 h-4 w-4" />Ny anläggning</Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_FACILITIES.map(facility => {
          const areas = MOCK_AREAS.filter(a => a.facility_id === facility.id);
          const owner = MOCK_USERS.find(u => u.id === facility.owner_id);
          return (
            <Card key={facility.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{facility.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{facility.description}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {facility.address}
                </div>
                <div className="text-xs text-muted-foreground">
                  Ägare: <span className="font-medium text-foreground">{owner?.full_name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {areas.map(area => (
                    <Badge key={area.id} variant="outline" className="text-xs">
                      {area.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
