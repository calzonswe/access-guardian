import type { OrgNode } from '@/types/organization';

export const MOCK_ORG_TREE: OrgNode[] = [
  {
    id: 'org-1',
    title: 'VD (CEO)',
    department: 'Ledning',
    userId: undefined, // Vacant
    children: [
      {
        id: 'org-2',
        title: 'IT-chef',
        department: 'IT',
        userId: 'u1', // Anna Svensson (Administrator)
        children: [],
      },
      {
        id: 'org-3',
        title: 'Driftchef',
        department: 'Drift',
        userId: 'u2', // Erik Lindqvist (Facility Owner)
        children: [
          {
            id: 'org-4',
            title: 'Driftadministratör',
            department: 'Drift',
            userId: 'u3', // Maria Johansson (Facility Admin)
            children: [],
          },
        ],
      },
      {
        id: 'org-5',
        title: 'Produktionschef',
        department: 'Produktion',
        userId: 'u4', // Lars Andersson (Line Manager)
        children: [
          {
            id: 'org-6',
            title: 'Produktionsmedarbetare',
            department: 'Produktion',
            userId: 'u5', // Karin Nilsson (Employee)
            children: [],
          },
          {
            id: 'org-7',
            title: 'Extern tekniker',
            department: 'Produktion',
            userId: 'u6', // Peter Müller (Contractor)
            children: [],
          },
        ],
      },
    ],
  },
];
