import { workspaceTitle } from '@/lib/constants/workspace';
import type { Board, TaskPriority, TaskStatus } from '@/lib/types/board';

const statusOrder: TaskStatus[] = ['pending', 'followUp', 'done'];
const priorityOrder: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

export const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  followUp: 'Follow Up',
  done: 'Done',
};

export const priorityLabels: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const boardData: Board[] = [
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Coordinate launch operations, creative approvals, and release readiness.',
    workspace: workspaceTitle,
    favorites: true,
    stats: {
      completionRate: 72,
      dueThisWeek: 6,
      activeAutomations: 4,
    },
    members: [
      { id: 'hanssen', name: 'Hanssen', initials: 'Ha', color: '#635bff', role: 'admin' },
      { id: 'handi', name: 'Handi', initials: 'Hi', color: '#ffcb57', role: 'member' },
      { id: 'kezia', name: 'Kezia', initials: 'K', color: '#00c875', role: 'member' },
      { id: 'dinda', name: 'Dinda', initials: 'D', color: '#ff5ac4', role: 'member' },
      { id: 'vira', name: 'Vira', initials: 'V', color: '#0073ea', role: 'member' },
    ],
    groups: [
      {
        id: 'launch-assets',
        name: 'List of Tasks',
        color: '#0fa958',
        tasks: [
          {
            id: 'task-1',
            name: 'Finalize hero visuals',
            status: 'followUp',
            assigneeId: 'kezia',
            dueDate: '2026-03-12',
            priority: 'high',
            progress: 86,
            notes: 'Waiting on product screenshots from design.',
          },
          {
            id: 'task-2',
            name: 'QA email nurture flow',
            status: 'followUp',
            assigneeId: 'handi',
            dueDate: '2026-03-14',
            priority: 'critical',
            progress: 64,
            notes: 'Review branch after content update.',
          },
          {
            id: 'task-3',
            name: 'Approve social cutdowns',
            status: 'done',
            assigneeId: 'vira',
            dueDate: '2026-03-10',
            priority: 'medium',
            progress: 100,
            notes: 'Ready for scheduling in Buffer.',
          },
        ],
      },
    ],
  },
  {
    id: 'client-implementation',
    name: 'Client Implementation',
    description: 'Track onboarding milestones, stakeholders, and blockers across teams.',
    workspace: workspaceTitle,
    favorites: false,
    stats: {
      completionRate: 54,
      dueThisWeek: 9,
      activeAutomations: 2,
    },
    members: [
      { id: 'hanssen', name: 'Hanssen', initials: 'Ha', color: '#635bff', role: 'admin' },
      { id: 'handi', name: 'Handi', initials: 'Hi', color: '#ffcb57', role: 'member' },
      { id: 'kezia', name: 'Kezia', initials: 'K', color: '#00c875', role: 'member' },
      { id: 'dinda', name: 'Dinda', initials: 'D', color: '#ff5ac4', role: 'member' },
      { id: 'vira', name: 'Vira', initials: 'V', color: '#0073ea', role: 'member' },
    ],
    groups: [
      {
        id: 'kickoff',
        name: 'Kickoff',
        color: '#00a3ab',
        tasks: [
          {
            id: 'task-7',
            name: 'Gather business requirements',
            status: 'followUp',
            assigneeId: 'kezia',
            dueDate: '2026-03-11',
            priority: 'high',
            progress: 62,
            notes: 'Need final process map from operations.',
          },
          {
            id: 'task-8',
            name: 'Set integration scope',
            status: 'followUp',
            assigneeId: 'hanssen',
            dueDate: '2026-03-16',
            priority: 'critical',
            progress: 73,
            notes: 'Security review pending for SSO flow.',
          },
        ],
      },
      {
        id: 'delivery',
        name: 'Delivery',
        color: '#ff642e',
        tasks: [
          {
            id: 'task-9',
            name: 'Train operations team',
            status: 'pending',
            assigneeId: 'dinda',
            dueDate: '2026-03-19',
            priority: 'medium',
            progress: 22,
            notes: 'Draft agenda and hands-on worksheet.',
          },
          {
            id: 'task-10',
            name: 'Validate launch checklist',
            status: 'done',
            assigneeId: 'vira',
            dueDate: '2026-03-08',
            priority: 'low',
            progress: 100,
            notes: 'Checklist signed off by delivery lead.',
          },
        ],
      },
    ],
  },
];

export const defaultBoardId = boardData[0].id;

export { priorityOrder, statusOrder };
