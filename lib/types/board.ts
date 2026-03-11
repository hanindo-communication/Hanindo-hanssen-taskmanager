export type ViewMode = 'table' | 'kanban';

export type TaskStatus = 'workingOnIt' | 'done' | 'stuck' | 'review' | 'planned';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type MemberRole = 'admin' | 'member' | 'viewer';

export type BoardMember = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: MemberRole;
};

export type TaskItem = {
  id: string;
  name: string;
  status: TaskStatus;
  assigneeId: string;
  dueDate: string;
  priority: TaskPriority;
  progress: number;
  notes: string;
};

export type TaskGroup = {
  id: string;
  name: string;
  color: string;
  tasks: TaskItem[];
};

export type Board = {
  id: string;
  name: string;
  description: string;
  workspace: string;
  favorites: boolean;
  members: BoardMember[];
  groups: TaskGroup[];
  stats: {
    completionRate: number;
    dueThisWeek: number;
    activeAutomations: number;
  };
};
