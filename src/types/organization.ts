export interface OrgNode {
  id: string;
  title: string;         // Position title (e.g. "VD", "Produktionschef")
  department?: string;
  userId?: string;       // Assigned user ID from MOCK_USERS
  children?: OrgNode[];
}
