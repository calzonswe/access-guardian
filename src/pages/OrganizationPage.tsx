import { useState } from 'react';
import { Building, Plus, ChevronRight, ChevronDown, Edit2, Trash2, UserPlus, GripVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS, type AppRole } from '@/types/rbac';
import { MOCK_USERS } from '@/data/mock-data';
import { useToast } from '@/hooks/use-toast';
import type { OrgNode } from '@/types/organization';
import { MOCK_ORG_TREE } from '@/data/org-data';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('');
}

function getUserById(id: string) {
  return MOCK_USERS.find(u => u.id === id);
}

interface OrgNodeCardProps {
  node: OrgNode;
  depth: number;
  onEdit: (node: OrgNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
}

function OrgNodeCard({ node, depth, onEdit, onAddChild, onDelete }: OrgNodeCardProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const user = getUserById(node.userId);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" style={{ marginLeft: -16 }} />
      )}
      <div className="group">
        <Card className={`mb-2 transition-all hover:shadow-md border-border/60 ${depth === 0 ? 'border-primary/30 bg-primary/[0.02]' : ''}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex items-center gap-1 shrink-0">
              {hasChildren ? (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <div className="w-6" />
              )}
            </div>

            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className={`text-xs font-medium ${depth === 0 ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>
                {user ? getInitials(user.full_name) : getInitials(node.title)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-foreground truncate">
                  {user ? user.full_name : 'Vakant'}
                </span>
                {!user && (
                  <Badge variant="outline" className="text-[10px] border-warning text-warning">Vakant</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{node.title}</span>
                {node.department && (
                  <Badge variant="secondary" className="text-[10px]">{node.department}</Badge>
                )}
              </div>
            </div>

            {user && (
              <div className="hidden sm:flex flex-wrap gap-1 shrink-0">
                {user.roles.map(r => (
                  <Badge key={r} variant="outline" className="text-[10px]">{ROLE_LABELS[r]}</Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddChild(node.id)}>
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              {depth > 0 && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(node.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {hasChildren && expanded && (
          <div className="ml-8 pl-4 border-l border-border/50">
            {node.children!.map(child => (
              <OrgNodeCard
                key={child.id}
                node={child}
                depth={depth + 1}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrganizationPage() {
  const [orgTree, setOrgTree] = useState<OrgNode[]>(MOCK_ORG_TREE);
  const [editDialog, setEditDialog] = useState<{ open: boolean; node?: OrgNode; parentId?: string }>({ open: false });
  const [formTitle, setFormTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formUserId, setFormUserId] = useState('');
  const { toast } = useToast();

  const openAdd = (parentId: string) => {
    setFormTitle('');
    setFormDepartment('');
    setFormUserId('');
    setEditDialog({ open: true, parentId });
  };

  const openEdit = (node: OrgNode) => {
    setFormTitle(node.title);
    setFormDepartment(node.department || '');
    setFormUserId(node.userId || '');
    setEditDialog({ open: true, node });
  };

  const addNodeToTree = (nodes: OrgNode[], parentId: string, newNode: OrgNode): OrgNode[] => {
    return nodes.map(n => {
      if (n.id === parentId) {
        return { ...n, children: [...(n.children || []), newNode] };
      }
      if (n.children) {
        return { ...n, children: addNodeToTree(n.children, parentId, newNode) };
      }
      return n;
    });
  };

  const updateNodeInTree = (nodes: OrgNode[], nodeId: string, updates: Partial<OrgNode>): OrgNode[] => {
    return nodes.map(n => {
      if (n.id === nodeId) return { ...n, ...updates };
      if (n.children) return { ...n, children: updateNodeInTree(n.children, nodeId, updates) };
      return n;
    });
  };

  const deleteNodeFromTree = (nodes: OrgNode[], nodeId: string): OrgNode[] => {
    return nodes
      .filter(n => n.id !== nodeId)
      .map(n => n.children ? { ...n, children: deleteNodeFromTree(n.children, nodeId) } : n);
  };

  const handleSave = () => {
    if (!formTitle.trim()) return;

    if (editDialog.node) {
      setOrgTree(prev => updateNodeInTree(prev, editDialog.node!.id, {
        title: formTitle,
        department: formDepartment || undefined,
        userId: formUserId || undefined,
      }));
      toast({ title: 'Position uppdaterad' });
    } else if (editDialog.parentId) {
      const newNode: OrgNode = {
        id: `org-${Date.now()}`,
        title: formTitle,
        department: formDepartment || undefined,
        userId: formUserId || undefined,
        children: [],
      };
      setOrgTree(prev => addNodeToTree(prev, editDialog.parentId!, newNode));
      toast({ title: 'Position tillagd' });
    }
    setEditDialog({ open: false });
  };

  const handleDelete = (nodeId: string) => {
    setOrgTree(prev => deleteNodeFromTree(prev, nodeId));
    toast({ title: 'Position borttagen', variant: 'destructive' });
  };

  const countNodes = (nodes: OrgNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + (n.children ? countNodes(n.children) : 0), 0);

  const countVacant = (nodes: OrgNode[]): number =>
    nodes.reduce((sum, n) => (n.userId ? 0 : 1) + (n.children ? countVacant(n.children) : 0), 0);

  const totalPositions = countNodes(orgTree);
  const vacantPositions = countVacant(orgTree);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Organisationsstruktur</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera företagets organisationsträd och hierarki</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalPositions}</p>
              <p className="text-xs text-muted-foreground">Totala positioner</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalPositions - vacantPositions}</p>
              <p className="text-xs text-muted-foreground">Tillsatta</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{vacantPositions}</p>
              <p className="text-xs text-muted-foreground">Vakanta</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {orgTree.map(root => (
            <OrgNodeCard
              key={root.id}
              node={root}
              depth={0}
              onEdit={openEdit}
              onAddChild={openAdd}
              onDelete={handleDelete}
            />
          ))}
        </CardContent>
      </Card>

      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editDialog.node ? 'Redigera position' : 'Lägg till position'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Befattning / Titel</Label>
              <Input id="title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="t.ex. Produktionschef" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Avdelning</Label>
              <Input id="department" value={formDepartment} onChange={e => setFormDepartment(e.target.value)} placeholder="t.ex. Produktion" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user">Tilldelad användare</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj användare (valfritt)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen (vakant)</SelectItem>
                  {MOCK_USERS.filter(u => u.is_active).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false })}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!formTitle.trim()}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
