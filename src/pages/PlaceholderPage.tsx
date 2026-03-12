import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Under utveckling</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Denna sida kommer snart</p>
        </CardContent>
      </Card>
    </div>
  );
}
