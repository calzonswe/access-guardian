import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { toast } from 'sonner';
import * as store from '@/services/dataStore';
import type { OrgNode } from '@/types/organization';

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }

interface OrgNodeCardProps { node: OrgNode; depth: number; onEdit: (node: OrgNode) => void; onAddChild: (parentId: string) => void; onDelete: (nodeId: string) => void; }

function OrgNodeCard({ node, depth, onEdit, onAddChild, onDelete }: OrgNodeCardProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const user = node.userId ? store.getUser(node.userId) : null;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div className={depth > 0 ? 'ml-6 border-l border-border pl-4' : ''}>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 mb-2 hover:shadow-sm transition-shadow">
        {hasChildren ? <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</Button> : <div className="w-6" />}
        <Avatar className="h-8 w-8 shrink-0"><AvatarFallback className="text-xs bg-primary/10 text-primary">{user ? getInitials(user.full_name) : '?'}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{node.title}</p>
          <div className="flex items-center gap-2">{node.department && <Badge variant="outline" className="text-xs">{node.department}</Badge>}<span className="text-xs text-muted-foreground">{user ? user.full_name : 'Vakant'}</span></div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddChild(node.id)}><Plus className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(node.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
        </div>
      </div>
      {expanded && hasChildren && node.children.map(child => <OrgNodeCard key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />)}
    </div>
  );
}

export default function OrganizationPage() {
  const [orgTree, setOrgTree] = useState<OrgNode[]>(() => store.getOrgTree());
  const [editDialog, setEditDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; parentId?: string; node?: OrgNode }>({ open: false, mode: 'add' });
  const [formTitle, setFormTitle] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formUserId, setFormUserId] = useState('');
  const users = store.getUsers();

  const saveTree = (tree: OrgNode[]) => { setOrgTree(tree); store.setOrgTree(tree); };
  const openAdd = (parentId?: string) => { setEditDialog({ open: true, mode: 'add', parentId }); setFormTitle(''); setFormDept(''); setFormUserId(''); };
  const openEdit = (node: OrgNode) => { setEditDialog({ open: true, mode: 'edit', node }); setFormTitle(node.title); setFormDept(node.department || ''); setFormUserId(node.userId || ''); };

  const addNode = (tree: OrgNode[], parentId: string | undefined, n: OrgNode): OrgNode[] => {
    if (!parentId) return [...tree, n];
    return tree.map(t => t.id === parentId ? { ...t, children: [...(t.children || []), n] } : { ...t, children: addNode(t.children || [], parentId, n) });
  };
  const updateNode = (tree: OrgNode[], id: string, data: Partial<OrgNode>): OrgNode[] => tree.map(t => t.id === id ? { ...t, ...data } : { ...t, children: updateNode(t.children || [], id, data) });
  const deleteNode = (tree: OrgNode[], id: string): OrgNode[] => tree.filter(t => t.id !== id).map(t => ({ ...t, children: deleteNode(t.children || [], id) }));
  const countNodes = (ns: OrgNode[]): number => ns.reduce((s, n) => s + 1 + countNodes(n.children || []), 0);
  const countVacant = (ns: OrgNode[]): number => ns.reduce((s, n) => s + (n.userId ? 0 : 1) + countVacant(n.children || []), 0);

  const handleSave = () => {
    if (!formTitle.trim()) { toast.error('Ange en titel'); return; }
    if (editDialog.mode === 'add') {
      saveTree(addNode(orgTree, editDialog.parentId, { id: crypto.randomUUID(), title: formTitle, department: formDept || undefined, userId: formUserId || undefined, children: [] }));
      toast.success('Position tillagd');
    } else if (editDialog.node) {
      saveTree(updateNode(orgTree, editDialog.node.id, { title: formTitle, department: formDept || undefined, userId: formUserId || undefined }));
      toast.success('Position uppdaterad');
    }
    setEditDialog({ open: false, mode: 'add' });
  };

  const handleDelete = (nodeId: string) => { if (confirm('Ta bort denna position och alla underordnade?')) { saveTree(deleteNode(orgTree, nodeId)); toast.success('Position borttagen'); } };
  const total = countNodes(orgTree); const vacant = countVacant(orgTree);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-foreground">Organisation</h1><p className="text-sm text-muted-foreground mt-1">Företagets organisationsstruktur</p></div>
        <Button onClick={() => openAdd(undefined)}><Plus className="mr-2 h-4 w-4" />Lägg till toppnivå</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Totala positioner" value={total} icon={Users} variant="primary" />
        <StatCard title="Tillsatta" value={total - vacant} icon={Users} variant="success" />
        <StatCard title="Vakanta" value={vacant} icon={Users} variant="warning" />
      </div>
      {orgTree.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">Ingen organisationsstruktur. Lägg till den första positionen.</CardContent></Card> : orgTree.map(node => <OrgNodeCard key={node.id} node={node} depth={0} onEdit={openEdit} onAddChild={openAdd} onDelete={handleDelete} />)}
      <Dialog open={editDialog.open} onOpenChange={open => setEditDialog(d => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editDialog.mode === 'add' ? 'Ny position' : 'Redigera position'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Titel</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Avdelning</Label><Input value={formDept} onChange={e => setFormDept(e.target.value)} /></div>
            <div className="space-y-2"><Label>Person</Label><Select value={formUserId || '__vacant__'} onValueChange={v => setFormUserId(v === '__vacant__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Vakant" /></SelectTrigger><SelectContent><SelectItem value="__vacant__">Vakant</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditDialog(d => ({ ...d, open: false }))}>Avbryt</Button><Button onClick={handleSave}>{editDialog.mode === 'add' ? 'Lägg till' : 'Spara'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
