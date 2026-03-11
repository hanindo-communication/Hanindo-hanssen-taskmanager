'use client';

import { createClient } from '@/lib/supabase/client';
import { workspaceTitle } from '@/lib/constants/workspace';
import { defaultBoardId } from '@/lib/mock-data/boards';
import type {
  Board,
  BoardMember,
  TaskGroup,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '@/lib/types/board';

type RowBoard = {
  id: string;
  name: string;
  description: string;
  workspace: string;
  favorites: boolean;
  completion_rate: number;
  due_this_week: number;
  active_automations: number;
};

type RowBoardMember = {
  id: string;
  board_id: string;
  name: string;
  initials: string;
  color: string;
  role?: string;
};

type RowTaskGroup = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  sort_order: number;
};

type RowTask = {
  id: string;
  group_id: string;
  name: string;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  progress: number;
  notes: string;
  sort_order: number;
};

function rowToBoard(
  row: RowBoard,
  members: RowBoardMember[],
  groups: RowTaskGroup[],
  tasksByGroup: Map<string, RowTask[]>
): Board {
  const boardMembers: BoardMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    color: m.color,
  }));

  const taskGroups: TaskGroup[] = groups
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => {
      const tasks = (tasksByGroup.get(g.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t): TaskItem => ({
          id: t.id,
          name: t.name,
          status: t.status,
          assigneeId: t.assignee_id ?? '',
          dueDate: t.due_date ?? '',
          priority: t.priority,
          progress: t.progress,
          notes: t.notes,
        }));
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        tasks,
      };
    });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspace: row.workspace || workspaceTitle,
    favorites: row.favorites,
    members: boardMembers,
    groups: taskGroups,
    stats: {
      completionRate: row.completion_rate,
      dueThisWeek: row.due_this_week,
      activeAutomations: row.active_automations,
    },
  };
}

export async function fetchBoardsFromSupabase(): Promise<Board[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const [boardsRes, membersRes, groupsRes, tasksRes] = await Promise.all([
    supabase.from('boards').select('*').order('created_at', { ascending: true }),
    supabase.from('board_members').select('*'),
    supabase.from('task_groups').select('*'),
    supabase.from('tasks').select('*'),
  ]);

  if (boardsRes.error) return [];
  const boards = (boardsRes.data ?? []) as RowBoard[];
  const members = (membersRes.data ?? []) as RowBoardMember[];
  const groups = (groupsRes.data ?? []) as RowTaskGroup[];
  const tasks = (tasksRes.data ?? []) as RowTask[];

  const membersByBoard = new Map<string, RowBoardMember[]>();
  for (const m of members) {
    const list = membersByBoard.get(m.board_id) ?? [];
    list.push(m);
    membersByBoard.set(m.board_id, list);
  }
  const groupsByBoard = new Map<string, RowTaskGroup[]>();
  for (const g of groups) {
    const list = groupsByBoard.get(g.board_id) ?? [];
    list.push(g);
    groupsByBoard.set(g.board_id, list);
  }
  const tasksByGroup = new Map<string, RowTask[]>();
  for (const t of tasks) {
    const list = tasksByGroup.get(t.group_id) ?? [];
    list.push(t);
    tasksByGroup.set(t.group_id, list);
  }

  return boards.map((row) =>
    rowToBoard(
      row,
      membersByBoard.get(row.id) ?? [],
      groupsByBoard.get(row.id) ?? [],
      tasksByGroup
    )
  );
}

export async function fetchBoardByIdFromSupabase(boardId: string): Promise<Board | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const [boardRes, membersRes, groupsRes] = await Promise.all([
    supabase.from('boards').select('*').eq('id', boardId).single(),
    supabase.from('board_members').select('*').eq('board_id', boardId),
    supabase.from('task_groups').select('*').eq('board_id', boardId).order('sort_order'),
  ]);

  if (boardRes.error || !boardRes.data) return null;
  const boardRow = boardRes.data as RowBoard;
  const members = (membersRes.data ?? []) as RowBoardMember[];
  const groups = (groupsRes.data ?? []) as RowTaskGroup[];

  let tasks: RowTask[] = [];
  if (groups.length > 0) {
    const groupIds = groups.map((g) => g.id);
    const { data: tasksData } = await supabase.from('tasks').select('*').in('group_id', groupIds);
    tasks = (tasksData ?? []) as RowTask[];
  }
  const tasksByGroup = new Map<string, RowTask[]>();
  for (const t of tasks) {
    const list = tasksByGroup.get(t.group_id) ?? [];
    list.push(t);
    tasksByGroup.set(t.group_id, list);
  }

  return rowToBoard(boardRow, members, groups, tasksByGroup);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s);
}

export async function saveBoardToSupabase(board: Board): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  if (!isValidUUID(board.id)) return;

  const { error: boardError } = await supabase
    .from('boards')
    .upsert(
      {
        id: board.id,
        name: board.name,
        description: board.description,
        workspace: board.workspace,
        favorites: board.favorites,
        completion_rate: board.stats.completionRate,
        due_this_week: board.stats.dueThisWeek,
        active_automations: board.stats.activeAutomations,
      },
      { onConflict: 'id' }
    );

  if (boardError) throw boardError;

  await supabase.from('board_members').delete().eq('board_id', board.id);
  if (board.members.length > 0) {
    const { error: membersError } = await supabase.from('board_members').insert(
      board.members.map((m) => ({
        id: m.id,
        board_id: board.id,
        name: m.name,
        initials: m.initials,
        color: m.color,
      }))
    );
    if (membersError) throw membersError;
  }

  const existingGroups = await supabase.from('task_groups').select('id').eq('board_id', board.id);
  const existingIds = (existingGroups.data ?? []).map((r: { id: string }) => r.id);
  if (existingIds.length > 0) {
    await supabase.from('tasks').delete().in('group_id', existingIds);
    await supabase.from('task_groups').delete().eq('board_id', board.id);
  }

  for (let i = 0; i < board.groups.length; i++) {
    const g = board.groups[i];
    const { error: groupError } = await supabase.from('task_groups').insert({
      id: g.id,
      board_id: board.id,
      name: g.name,
      color: g.color,
      sort_order: i,
    });
    if (groupError) throw groupError;

    for (let j = 0; j < g.tasks.length; j++) {
      const t = g.tasks[j];
      const assigneeId =
        t.assigneeId && board.members.some((m) => m.id === t.assigneeId) ? t.assigneeId : null;
      const { error: taskError } = await supabase.from('tasks').insert({
        id: t.id,
        group_id: g.id,
        name: t.name,
        status: t.status,
        assignee_id: assigneeId,
        due_date: t.dueDate || null,
        priority: t.priority,
        progress: t.progress,
        notes: t.notes,
        sort_order: j,
      });
      if (taskError) throw taskError;
    }
  }
}

export async function deleteBoardFromSupabase(boardId: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  await supabase.from('boards').delete().eq('id', boardId);
}

function generateUUID(): string {
  return crypto.randomUUID();
}

export async function createBoardFromTemplateInSupabase(
  template: Board,
  existingBoards: Board[],
  name?: string
): Promise<Board> {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase not configured');

  const templateBase =
    template.groups.length > 0
      ? template
      : existingBoards.find((b) => b.id === defaultBoardId) ?? template;
  const nextBoardName = (name?.trim() || `New Board ${existingBoards.length + 1}`).slice(0, 255);

  const boardId = generateUUID();
  const memberIdMap = new Map<string, string>();
  const newMembers: BoardMember[] = templateBase.members.map((m) => {
    const newId = generateUUID();
    memberIdMap.set(m.id, newId);
    return { ...m, id: newId };
  });
  const newGroups: TaskGroup[] = templateBase.groups.map((g, index) => ({
    ...g,
    id: generateUUID(),
    tasks: g.tasks.map((t) => ({
      ...t,
      id: generateUUID(),
      assigneeId: t.assigneeId ? memberIdMap.get(t.assigneeId) ?? '' : '',
    })),
  }));

  const newBoard: Board = {
    id: boardId,
    name: nextBoardName,
    description: 'New board ready for planning and task assignment.',
    workspace: workspaceTitle,
    favorites: false,
    members: newMembers,
    groups: newGroups,
    stats: { completionRate: 0, dueThisWeek: 0, activeAutomations: 0 },
  };

  await saveBoardToSupabase(newBoard);
  return newBoard;
}
