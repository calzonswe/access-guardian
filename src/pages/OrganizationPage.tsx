import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Building2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { toast } from 'sonner';
import * as store from '@/services/dataStore';
import { ORG_UNIT_LABELS, ORG_ALLOWED_PARENTS, type OrgUnit, type OrgUnitType } from '@/types/organization';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { useAuth } from '@/context/AuthContext';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const TYPE_STYLES: Record<OrgUnitType, string> = {
  company: 'bg-primary/10 text-primary border-primary/20',
  department: 'bg-accent text-accent-foreground',
  unit: 'bg-muted text-muted-foreground',
  group: 'bg-secondary text-secondary-foreground',
};

/** Which child types may be created under a given unit type. */
function childTypesOf(type: OrgUnitType | null): OrgUnitType[] {
  return (Object.keys(ORG_ALLOWED_PARENTS) as OrgUnitType[]).filter(t =>
    ORG_ALLOWED_PARENTS[t].includes(type)
  );
}

interface NodeProps {
  node: OrgUnit;
  depth: number;
  memberCount: (unitId: string) => number;
  canEdit: boolean;
  onEdit: (n: OrgUnit) => void;
  onAddChild: (n: OrgUnit) => void;
  onDelete: (n: OrgUnit) => void;
}

function OrgUnitCard({ node, depth, memberCount, canEdit, onEdit, onAddChild, onDelete }: NodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const manager = node.managerId ? store.getUser(node.managerId) : null;
  const hasChildren = !!node.children?.length;
  const allowedChildren = childTypesOf(node.type);
  return (
    <div className={depth > 0 ? 'ml-6 border-l border-border pl-4' : ''}>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 mb-2 hover:shadow-sm transition-shadow">
        {hasChildren ? (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        ) : <div className="w-6" />}
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {manager ? getInitials(manager.full_name) : <Building2 className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{node.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-xs ${TYPE_STYLES[node.type]}`}>{ORG_UNIT_LABELS[node.type]}</Badge>
            <span className="text-xs text-muted-foreground">Chef: {manager ? manager.full_name : 'Ej utsedd'}</span>
            <span className="text-xs text-muted-foreground">· {memberCount(node.id)} medarbetare</span>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0">
            {allowedChildren.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Lägg till underenhet" onClick={() => onAddChild(node)}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(node)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </div>
        )}
      </div>
      {expanded && node.children?.map(child => (
        <OrgUnitCard key={child.id} node={child} depth={depth + 1} memberCount={memberCount} canEdit={canEdit}
          onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function OrganizationPage() {
  const { currentUser } = useAuth();
  const { reload } = useDataRefresh();
  const [dialog, setDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; parent?: OrgUnit; node?: OrgUnit }>({ open: false, mode: 'add' });
  const [name, setName] = useState('');
  const [type, setType] = useState<OrgUnitType>('department');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');

  const tree = store.getOrgUnits();
  const users = store.getUsers();
  const canEdit = !!currentUser?.roles.includes('administrator');

  const countUnits = (ns: OrgUnit[]): number => ns.reduce((s, n) => s + 1 + countUnits(n.children || []), 0);
  const countByType = (ns: OrgUnit[], t: OrgUnitType): number =>
    ns.reduce((s, n) => s + (n.type === t ? 1 : 0) + countByType(n.children || [], t), 0);
  const memberCount = (unitId: string) => users.filter(u => u.org_unit_id === unitId).length;

  const availableTypes = dialog.mode === 'add'
    ? childTypesOf(dialog.parent?.type ?? null)
    : (Object.keys(ORG_UNIT_LABELS) as OrgUnitType[]).filter(t =>
        ORG_ALLOWED_PARENTS[t].includes(
          dialog.node?.parentId
            ? (findUnit(tree, dialog.node.parentId)?.type ?? null)
            : null
        )
      );

  function findUnit(ns: OrgUnit[], id: string): OrgUnit | undefined {
    for (const n of ns) {
      if (n.id === id) return n;
      const hit = findUnit(n.children || [], id);
      if (hit) return hit;
    }
    return undefined;
  }

  const openAdd = (parent?: OrgUnit) => {
    const allowed = childTypesOf(parent?.type ?? null);
    setDialog({ open: true, mode: 'add', parent });
    setName(''); setDescription(''); setManagerId('');
    setType(allowed[0] || 'department');
  };

  const openEdit = (node: OrgUnit) => {
    setDialog({ open: true, mode: 'edit', node });
    setName(node.name); setType(node.type); setDescription(node.description || ''); setManagerId(node.managerId || '');
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Ange ett namn'); return; }
    try {
      if (dialog.mode === 'add') {
        await store.createOrgUnit({ name: name.trim(), type, description: description || undefined, parentId: dialog.parent?.id, managerId: managerId || undefined });
        toast.success('Organisationsenhet skapad');
      } else if (dialog.node) {
        await store.updateOrgUnit(dialog.node.id, { name: name.trim(), type, description: description || undefined, managerId: managerId || undefined });
        toast.success('Organisationsenhet uppdaterad');
      }
      setDialog({ open: false, mode: 'add' });
      reload();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte spara');
    }
  };

  const handleDelete = async (node: OrgUnit) => {
    if (!confirm(`Ta bort "${node.name}" och alla underliggande enheter?`)) return;
    try {
      await store.deleteOrgUnit(node.id);
      toast.success('Organisationsenhet borttagen');
      reload();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte ta bort');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Organisation</h1>
          <p className="text-sm text-muted-foreground mt-1">Bygg strukturen: Företag/VD → Avdelning → Enhet → Grupp</p>
        </div>
        {canEdit && <Button onClick={() => openAdd(undefined)}><Plus className="mr-2 h-4 w-4" />Ny toppnivå</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard title="Totalt enheter" value={countUnits(tree)} icon={Building2} variant="primary" />
        <StatCard title="Avdelningar" value={countByType(tree, 'department')} icon={Building2} variant="default" />
        <StatCard title="Enheter" value={countByType(tree, 'unit')} icon={Building2} variant="default" />
        <StatCard title="Grupper" value={countByType(tree, 'group')} icon={Users} variant="default" />
      </div>

      {tree.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          Ingen organisationsstruktur ännu. Skapa först ett företag eller en avdelning på toppnivå – därefter kan användare placeras i strukturen.
        </CardContent></Card>
      ) : tree.map(node => (
        <OrgUnitCard key={node.id} node={node} depth={0} memberCount={memberCount} canEdit={canEdit}
          onEdit={openEdit} onAddChild={openAdd} onDelete={handleDelete} />
      ))}

      <Dialog open={dialog.open} onOpenChange={open => setDialog(d => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.mode === 'add' ? 'Ny organisationsenhet' : 'Redigera organisationsenhet'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {dialog.mode === 'add' && (
              <p className="text-sm text-muted-foreground">
                {dialog.parent ? `Placeras under: ${dialog.parent.name}` : 'Placeras på toppnivå'}
              </p>
            )}
            <div className="space-y-2"><Label>Namn</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="t.ex. Produktion" /></div>
            <div className="space-y-2">
              <Label>Nivå</Label>
              <Select value={type} onValueChange={v => setType(v as OrgUnitType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(availableTypes.length ? availableTypes : [type]).map(t => (
                    <SelectItem key={t} value={t}>{ORG_UNIT_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Beskrivning</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Chef (valfritt)</Label>
              <Select value={managerId || '__none__'} onValueChange={v => setManagerId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(d => ({ ...d, open: false }))}>Avbryt</Button>
            <Button onClick={handleSave}>{dialog.mode === 'add' ? 'Skapa' : 'Spara'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
