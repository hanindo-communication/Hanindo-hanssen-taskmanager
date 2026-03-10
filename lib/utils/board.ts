import { boardData, priorityLabels, statusLabels } from '@/lib/mock-data/boards';
import type { Board, BoardMember, TaskItem, TaskPriority, TaskStatus } from '@/lib/types/board';

export function getBoards(): Board[] {
  return boardData;
}

export function getBoardById(boardId: string): Board | undefined {
  return boardData.find((board) => board.id === boardId);
}

export function getMember(board: Board, memberId: string): BoardMember | undefined {
  return board.members.find((member) => member.id === memberId);
}

export function getAllTasks(board: Board): TaskItem[] {
  return board.groups.flatMap((group) => group.tasks);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function getStatusLabel(status: TaskStatus): string {
  return statusLabels[status];
}

export function getPriorityLabel(priority: TaskPriority): string {
  return priorityLabels[priority];
}

export function getCompletionSummary(board: Board): string {
  const doneCount = getAllTasks(board).filter((task) => task.status === 'done').length;
  return `${doneCount}/${getAllTasks(board).length} done`;
}
