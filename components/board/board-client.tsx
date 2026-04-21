'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { priorityLabels, priorityOrder, statusLabels, statusOrder } from '@/lib/mock-data/boards';
import { loadBoardById, saveBoardAsync } from '@/lib/utils/board-storage';
import { formatDate, getMember } from '@/lib/utils/board';
import { useWorkspaceRole } from '@/lib/contexts/WorkspaceRoleContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { Board, HistoryLogEntry, TaskGroup, TaskItem, TaskPriority, TaskStatus, ViewMode } from '@/lib/types/board';
import { ContextualHint } from '@/components/overview/ContextualHint';
import styles from './board-client.module.css';

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  variant: 'danger' | 'default';
  onConfirm: () => void;
};

type BoardClientProps = {
  initialBoard: Board | null;
  boardId: string;
};

type DragState = {
  taskId: string;
  sourceGroupId: string;
  sourceStatus: TaskStatus;
  mode: ViewMode;
};

const statusClassNames: Record<TaskStatus, string> = {
  pending: styles.statusPending,
  followUp: styles.statusFollowUp,
  done: styles.statusDone,
};

const priorityClassNames: Record<TaskPriority, string> = {
  critical: styles.priorityCritical,
  high: styles.priorityHigh,
  medium: styles.priorityMedium,
  low: styles.priorityLow,
};

const memberColorPalette = ['#635bff', '#0073ea', '#00c875', '#fdab3d', '#ff5ac4', '#00a3ab', '#784bd1', '#ff642e'];

/** Accent stripe for segments in #list-of-tasks */
const LIST_OF_TASKS_SEGMENT_COLOR = '#f5c518';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getTextareaRows(value: string, charsPerRow = 30): number {
  return value.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / charsPerRow)), 0);
}

function updateTask(board: Board, taskId: string, updater: (task: TaskItem) => TaskItem): Board {
  return {
    ...board,
    groups: board.groups.map((group) => ({
      ...group,
      tasks: group.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    })),
  };
}

function deleteTask(board: Board, taskId: string): Board {
  return {
    ...board,
    groups: board.groups.map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => task.id !== taskId),
    })),
  };
}

function updateGroup(board: Board, groupId: string, updater: (group: TaskGroup) => TaskGroup): Board {
  return {
    ...board,
    groups: board.groups.map((group) => (group.id === groupId ? updater(group) : group)),
  };
}

function deleteGroup(board: Board, groupId: string): Board {
  return {
    ...board,
    groups: board.groups.filter((group) => group.id !== groupId),
  };
}

function updateMember(
  board: Board,
  memberId: string,
  updater: (member: Board['members'][number]) => Board['members'][number],
): Board {
  return {
    ...board,
    members: board.members.map((member) => (member.id === memberId ? updater(member) : member)),
  };
}

function buildNewTask(group: TaskGroup): TaskItem {
  return {
    id: `${group.id}-${Date.now()}`,
    name: 'New action item',
    status: 'pending',
    assigneeId: '',
    dueDate: '2026-03-21',
    priority: 'medium',
    progress: 0,
    notes: 'Add context or next step.',
  };
}

function buildNewMember(existingCount: number): Board['members'][number] {
  const label = existingCount + 1;

  return {
    id: `member-${Date.now()}`,
    name: `New Member ${label}`,
    initials: `N${label}`,
    color: memberColorPalette[existingCount % memberColorPalette.length],
  };
}

function getTaskLocation(board: Board, taskId: string) {
  for (const group of board.groups) {
    const index = group.tasks.findIndex((task) => task.id === taskId);

    if (index >= 0) {
      return {
        groupId: group.id,
        index,
        task: group.tasks[index],
      };
    }
  }

  return null;
}

function moveTaskBetweenGroups(
  board: Board,
  taskId: string,
  targetGroupId: string,
  targetIndex?: number,
): Board {
  const source = getTaskLocation(board, taskId);

  if (!source) {
    return board;
  }

  const groupsWithoutTask = board.groups.map((group) =>
    group.id === source.groupId
      ? {
          ...group,
          tasks: group.tasks.filter((task) => task.id !== taskId),
        }
      : group,
  );

  return {
    ...board,
    groups: groupsWithoutTask.map((group) => {
      if (group.id !== targetGroupId) {
        return group;
      }

      const nextTasks = [...group.tasks];
      let safeIndex =
        targetIndex === undefined ? nextTasks.length : Math.max(0, Math.min(targetIndex, nextTasks.length));

      if (source.groupId === targetGroupId && source.index < safeIndex) {
        safeIndex -= 1;
      }

      nextTasks.splice(safeIndex, 0, source.task);

      return {
        ...group,
        tasks: nextTasks,
      };
    }),
  };
}

function updateTaskStatus(board: Board, taskId: string, status: TaskStatus): Board {
  return updateTask(board, taskId, (task) => ({
    ...task,
    status,
  }));
}

function moveGroup(board: Board, groupId: string, direction: 'up' | 'down'): Board {
  const currentIndex = board.groups.findIndex((group) => group.id === groupId);

  if (currentIndex < 0) {
    return board;
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= board.groups.length) {
    return board;
  }

  const nextGroups = [...board.groups];
  const [group] = nextGroups.splice(currentIndex, 1);
  nextGroups.splice(targetIndex, 0, group);

  return {
    ...board,
    groups: nextGroups,
  };
}

type EditableTextFieldProps = {
  value: string;
  onConfirm: (nextValue: string) => void;
  ariaLabel: string;
  className: string;
  multiline?: boolean;
  minRows?: number;
  charsPerRow?: number;
  placeholder?: string;
  onDoubleClick?: () => void;
};

function EditableTextField({
  value,
  onConfirm,
  ariaLabel,
  className,
  multiline = false,
  minRows = 1,
  charsPerRow,
  placeholder,
  onDoubleClick,
}: EditableTextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const isDirty = draft !== value;

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  function handleCancel() {
    setDraft(value);
    setIsEditing(false);
  }

  function handleConfirm() {
    if (isDirty) {
      onConfirm(draft);
    }

    setIsEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }

    if (!multiline && event.key === 'Enter') {
      event.preventDefault();
      handleConfirm();
    }
  }

  const textareaRows = multiline ? Math.max(minRows, getTextareaRows(draft, charsPerRow)) : undefined;

  return (
    <div className={`${styles.editableField} ${isEditing ? styles.editableFieldActive : ''}`}>
      {multiline ? (
        <textarea
          className={className}
          value={draft}
          rows={textareaRows}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={handleConfirm}
          onKeyDown={handleKeyDown}
          onDoubleClick={onDoubleClick}
          aria-label={ariaLabel}
        />
      ) : (
        <input
          className={className}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={handleConfirm}
          onKeyDown={handleKeyDown}
          onDoubleClick={onDoubleClick}
          aria-label={ariaLabel}
        />
      )}

      {isEditing ? (
        <div className={styles.editableActions}>
          <button type="button" className={styles.editableActionButton} onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.editableActionButton} ${styles.editableActionConfirm}`}
            onClick={handleConfirm}
            disabled={!isDirty}
          >
            Confirm
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BoardClient({ initialBoard, boardId }: BoardClientProps) {
  const { canEdit } = useWorkspaceRole();
  const readOnly = !canEdit;
  const [board, setBoard] = useState<Board | null>(initialBoard);
  const [boardLoading, setBoardLoading] = useState(!initialBoard);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tableDropTarget, setTableDropTarget] = useState<{ groupId: string; taskId?: string } | null>(null);
  const [kanbanDropTarget, setKanbanDropTarget] = useState<{ status: TaskStatus; taskId?: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
  });
  const currentUserRef = useRef<string>('Someone');
  const viewMode: ViewMode = 'table';

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email;
      const name = session?.user?.user_metadata?.name ?? session?.user?.user_metadata?.full_name;
      currentUserRef.current = name && String(name).trim() ? String(name) : email ?? 'Someone';
    });
  }, []);
  const allTasks = useMemo(() => board?.groups.flatMap((group) => group.tasks) ?? [], [board]);

  // Always load from storage (Supabase + localStorage) so saved changes (e.g. new members) persist after refresh
  useEffect(() => {
    let cancelled = false;
    setBoardLoading(true);
    loadBoardById(boardId).then((loaded) => {
      if (!cancelled) {
        setBoard(loaded ?? initialBoard);
        setBoardLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, initialBoard]);

  useEffect(() => {
    if (!board) return;
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [boardId, board]);

  // Keep latest board in ref so we can save on page hide/refresh
  const boardRef = useRef<Board | null>(board);
  boardRef.current = board ?? null;

  useEffect(() => {
    if (!board || readOnly) return;
    const t = setTimeout(() => {
      saveBoardAsync(board);
    }, 400);
    return () => clearTimeout(t);
  }, [board, readOnly]);

  // Save to Supabase when user leaves tab or refreshes (keepalive so request can complete after unload)
  useEffect(() => {
    const saveOnHide = () => {
      const b = boardRef.current;
      if (!b || readOnly) return;
      // Use fetch with keepalive so the save request is sent even when page unloads (refresh/close)
      fetch(`/api/boards/${boardId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
        keepalive: true,
      }).catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveOnHide();
    };
    const onBeforeUnload = () => {
      saveOnHide();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [boardId, readOnly]);

  // When user clicks topbar "Save" button, persist current board to Supabase
  useEffect(() => {
    const handler = () => {
      const b = boardRef.current;
      if (b && !readOnly) saveBoardAsync(b);
    };
    window.addEventListener('task-manager:save-request', handler);
    return () => window.removeEventListener('task-manager:save-request', handler);
  }, [readOnly]);

  const visibleGroups = useMemo(() => board?.groups ?? [], [board]);

  const visibleTasks = useMemo(() => visibleGroups.flatMap((group) => group.tasks), [visibleGroups]);

  const taskGroupMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();

    (board?.groups ?? []).forEach((group) => {
      group.tasks.forEach((task) => {
        map.set(task.id, {
          id: group.id,
          name: group.name,
        });
      });
    });

    return map;
  }, [board]);

  const visibleTaskIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks]);
  const selectedCount = selectedTaskIds.length;
  const detailTask = useMemo(() => allTasks.find((task) => task.id === detailTaskId) ?? null, [allTasks, detailTaskId]);
  const detailTaskGroup = detailTask ? taskGroupMap.get(detailTask.id) : null;

  function updateCurrentBoard(updater: (currentBoard: Board) => Board, logEntry?: { action: string; details?: string }) {
    const actor = currentUserRef.current;
    setBoard((currentBoard) => {
      if (!currentBoard) return currentBoard;
      const next = updater(currentBoard);
      if (readOnly || !logEntry) return next;
      const log: HistoryLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor,
        action: logEntry.action,
        details: logEntry.details,
      };
      return { ...next, historyLogs: [...(next.historyLogs ?? []), log] };
    });
  }

  function handleTaskChange(taskId: string, updates: Partial<TaskItem>) {
    const taskName = allTasks.find((t) => t.id === taskId)?.name ?? 'Task';
    updateCurrentBoard(
      (currentBoard) =>
        updateTask(currentBoard, taskId, (task) => ({
          ...task,
          ...updates,
        })),
      { action: 'Updated task', details: taskName }
    );
  }

  function handleGroupChange(groupId: string, updates: Partial<TaskGroup>) {
    const groupName = board?.groups.find((g) => g.id === groupId)?.name ?? 'Segment';
    updateCurrentBoard(
      (currentBoard) =>
        updateGroup(currentBoard, groupId, (group) => ({
          ...group,
          ...updates,
        })),
      { action: 'Updated segment', details: groupName }
    );
  }

  function handleMemberChange(memberId: string, name: string) {
    const nextBoard =
      board &&
      updateMember(board, memberId, (member) => ({
        ...member,
        name,
        initials: getInitials(name) || member.initials,
      }));
    updateCurrentBoard(
      (currentBoard) =>
        updateMember(currentBoard, memberId, (member) => ({
          ...member,
          name,
          initials: getInitials(name) || member.initials,
        })),
      { action: 'Renamed member', details: name }
    );
    if (nextBoard) saveBoardAsync(nextBoard);
  }

  function handleMemberColorChange(memberId: string, color: string) {
    const nextBoard =
      board && updateMember(board, memberId, (member) => ({ ...member, color }));
    updateCurrentBoard((currentBoard) =>
      updateMember(currentBoard, memberId, (member) => ({
        ...member,
        color,
      }))
    );
    if (nextBoard) saveBoardAsync(nextBoard);
  }

  function handleAddMember() {
    const nextBoard = board
      ? {
          ...board,
          members: [...board.members, buildNewMember(board.members.length)],
        }
      : null;
    updateCurrentBoard((currentBoard) => ({
      ...currentBoard,
      members: [...currentBoard.members, buildNewMember(currentBoard.members.length)],
    }), { action: 'Added board member' });
    if (nextBoard) saveBoardAsync(nextBoard);
  }

  function handleRemoveMember(memberId: string) {
    const memberName = board?.members.find((m) => m.id === memberId)?.name ?? 'Member';
    const nextBoard = board
      ? {
          ...board,
          members: board.members.filter((member) => member.id !== memberId),
          groups: board.groups.map((group) => ({
            ...group,
            tasks: group.tasks.map((task) =>
              task.assigneeId === memberId ? { ...task, assigneeId: '' } : task
            ),
          })),
        }
      : null;
    updateCurrentBoard(
      (currentBoard) => ({
        ...currentBoard,
        members: currentBoard.members.filter((member) => member.id !== memberId),
        groups: currentBoard.groups.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.assigneeId === memberId
              ? {
                  ...task,
                  assigneeId: '',
                }
              : task,
          ),
        })),
      }),
      { action: 'Removed board member', details: memberName }
    );
    if (nextBoard) saveBoardAsync(nextBoard);
  }

  function handleBoardTextChange(updates: Pick<Board, 'name' | 'description'>) {
    updateCurrentBoard(
      (currentBoard) => ({
        ...currentBoard,
        ...updates,
      }),
      updates.name ? { action: 'Updated board name', details: updates.name } : { action: 'Updated board description' }
    );
  }

  function handleDeleteTask(taskId: string) {
    setConfirm({
      open: true,
      title: 'Delete item?',
      message: 'This task will be removed. This action cannot be undone.',
      variant: 'danger',
      onConfirm: () => {
        const taskName = allTasks.find((t) => t.id === taskId)?.name ?? 'Task';
        setSelectedTaskIds((current) => current.filter((id) => id !== taskId));
        setDetailTaskId((current) => (current === taskId ? null : current));
        const nextBoard = board ? deleteTask(board, taskId) : null;
        updateCurrentBoard((currentBoard) => deleteTask(currentBoard, taskId), {
          action: 'Deleted task',
          details: taskName,
        });
        if (nextBoard) saveBoardAsync(nextBoard);
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }

  function handleDeleteGroup(groupId: string) {
    const group = board?.groups.find((g) => g.id === groupId);
    const taskCount = group?.tasks.length ?? 0;
    setConfirm({
      open: true,
      title: 'Delete segment?',
      message: `This will remove the segment "${group?.name ?? 'Untitled'}" and all ${taskCount} item(s) in it. This action cannot be undone.`,
      variant: 'danger',
      onConfirm: () => {
        const taskIdsToRemove = group?.tasks.map((task) => task.id) ?? [];
        setSelectedTaskIds((current) => current.filter((id) => !taskIdsToRemove.includes(id)));
        setDetailTaskId((current) => (current && taskIdsToRemove.includes(current) ? null : current));
        const nextBoard = board ? deleteGroup(board, groupId) : null;
        updateCurrentBoard((currentBoard) => deleteGroup(currentBoard, groupId), {
          action: 'Deleted segment',
          details: group?.name ?? 'Segment',
        });
        if (nextBoard) saveBoardAsync(nextBoard);
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }

  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    const groupName = board?.groups.find((g) => g.id === groupId)?.name ?? 'Segment';
    updateCurrentBoard((currentBoard) => moveGroup(currentBoard, groupId, direction), {
      action: 'Moved segment',
      details: `${groupName} ${direction === 'up' ? 'up' : 'down'}`,
    });
  }

  function handleAddTask(groupId: string) {
    const groupName = board?.groups.find((g) => g.id === groupId)?.name ?? 'Segment';
    updateCurrentBoard((currentBoard) => ({
      ...currentBoard,
      groups: currentBoard.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              tasks: [...group.tasks, buildNewTask(group)],
            }
          : group,
      ),
    }), { action: 'Added task', details: groupName });
  }

  function clearDragState() {
    setDragState(null);
    setTableDropTarget(null);
    setKanbanDropTarget(null);
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  function toggleGroupSelection(group: TaskGroup) {
    const groupTaskIds = group.tasks.map((task) => task.id);
    const allSelected = groupTaskIds.every((taskId) => selectedTaskIds.includes(taskId));

    setSelectedTaskIds((current) => {
      if (allSelected) {
        return current.filter((taskId) => !groupTaskIds.includes(taskId));
      }

      return Array.from(new Set([...current, ...groupTaskIds]));
    });
  }

  function toggleVisibleSelection() {
    const allVisibleSelected =
      visibleTaskIds.length > 0 && visibleTaskIds.every((taskId) => selectedTaskIds.includes(taskId));

    setSelectedTaskIds((current) => {
      if (allVisibleSelected) {
        return current.filter((taskId) => !visibleTaskIds.includes(taskId));
      }

      return Array.from(new Set([...current, ...visibleTaskIds]));
    });
  }

  function applyBulkStatus(status: TaskStatus) {
    updateCurrentBoard(
      (currentBoard) => {
        let nextBoard = currentBoard;
        selectedTaskIds.forEach((taskId) => {
          nextBoard = updateTaskStatus(nextBoard, taskId, status);
        });
        return nextBoard;
      },
      { action: 'Bulk status change', details: `${selectedCount} task(s) → ${statusLabels[status]}` }
    );
  }

  function applyBulkMove(targetGroupId: string) {
    const targetName = board?.groups.find((g) => g.id === targetGroupId)?.name ?? 'segment';
    updateCurrentBoard(
      (currentBoard) => {
        let nextBoard = currentBoard;
        selectedTaskIds.forEach((taskId) => {
          nextBoard = moveTaskBetweenGroups(nextBoard, taskId, targetGroupId);
        });
        return nextBoard;
      },
      { action: 'Bulk move', details: `${selectedCount} task(s) → ${targetName}` }
    );
  }

  function handleTableDrop(targetGroupId: string, targetTaskId?: string) {
    if (!dragState) return;
    const taskName = getTaskLocation(board!, dragState.taskId)?.task.name ?? 'Task';
    const targetName = board?.groups.find((g) => g.id === targetGroupId)?.name ?? 'segment';
    updateCurrentBoard((currentBoard) => {
      const targetGroup = currentBoard.groups.find((group) => group.id === targetGroupId);

      if (!targetGroup) {
        return currentBoard;
      }

      const nextIndex =
        targetTaskId === undefined ? targetGroup.tasks.length : targetGroup.tasks.findIndex((task) => task.id === targetTaskId);

      return moveTaskBetweenGroups(
        currentBoard,
        dragState.taskId,
        targetGroupId,
        nextIndex >= 0 ? nextIndex : undefined,
      );
    }, { action: 'Moved task', details: `${taskName} → ${targetName}` });

    clearDragState();
  }

  function handleKanbanDrop(targetStatus: TaskStatus, targetTaskId?: string) {
    if (!dragState) return;
    const taskName = getTaskLocation(board!, dragState.taskId)?.task.name ?? 'Task';
    updateCurrentBoard(
      (currentBoard) => {
        let nextBoard = currentBoard;
        if (targetTaskId && targetTaskId !== dragState.taskId) {
          const targetLocation = getTaskLocation(currentBoard, targetTaskId);
          if (targetLocation) {
            nextBoard = moveTaskBetweenGroups(
              currentBoard,
              dragState.taskId,
              targetLocation.groupId,
              targetLocation.index,
            );
          }
        }
        return updateTaskStatus(nextBoard, dragState.taskId, targetStatus);
      },
      { action: 'Changed status', details: `${taskName} → ${statusLabels[targetStatus]}` }
    );
    clearDragState();
  }

  const kanbanColumns = statusOrder.map((status) => ({
    status,
    items: visibleTasks
      .filter((task) => task.status === status)
      .map((task) => ({
        task,
        group: taskGroupMap.get(task.id) ?? { id: '', name: '' },
      })),
  }));

  const taskTableHead = (
    <thead>
      <tr>
        <th className={styles.checkboxColumn}>Pick</th>
        <th className={styles.dragColumn}>Move</th>
        <th>Item</th>
        <th>Status</th>
        <th>Owner</th>
        <th>Due date</th>
        <th>Priority</th>
        <th>Notes</th>
        <th>Delete</th>
      </tr>
    </thead>
  );

  function renderTaskTableRow(task: TaskItem, group: TaskGroup, currentBoard: Board) {
    const member = getMember(currentBoard, task.assigneeId);

    return (
      <tr
        key={task.id}
        className={`${styles.taskRow} ${dragState?.taskId === task.id ? styles.taskRowDragging : ''} ${
          tableDropTarget?.groupId === group.id && tableDropTarget.taskId === task.id ? styles.taskRowDropActive : ''
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setTableDropTarget({ groupId: group.id, taskId: task.id });
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleTableDrop(group.id, task.id);
        }}
      >
        <td>
          <input
            type="checkbox"
            checked={selectedTaskIds.includes(task.id)}
            onChange={() => toggleTaskSelection(task.id)}
            aria-label={`Select ${task.name}`}
          />
        </td>
        <td>
          <div
            draggable
            className={styles.dragHandle}
            onDragStart={() =>
              setDragState({
                taskId: task.id,
                sourceGroupId: group.id,
                sourceStatus: task.status,
                mode: 'table',
              })
            }
            onDragEnd={clearDragState}
            role="presentation"
          >
            ⋮⋮
          </div>
        </td>
        <td>
          <div className={styles.itemCell}>
            <EditableTextField
              className={styles.itemTextarea}
              value={task.name}
              onConfirm={(nextValue) => handleTaskChange(task.id, { name: nextValue })}
              onDoubleClick={() => setDetailTaskId(task.id)}
              ariaLabel={`Task item ${task.name}`}
              multiline
              charsPerRow={30}
            />
            <button
              type="button"
              className={styles.inlineLinkButton}
              onClick={() => setDetailTaskId(task.id)}
            >
              Open full info
            </button>
          </div>
        </td>
        <td>
          <select
            className={`${styles.inlineSelect} ${statusClassNames[task.status]}`}
            value={task.status}
            onChange={(event) =>
              handleTaskChange(task.id, {
                status: event.target.value as TaskStatus,
              })
            }
          >
            {statusOrder.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <div className={styles.personCell}>
            <span className={styles.avatar} style={{ background: member?.color ?? '#d0d7f2' }}>
              {member?.initials ?? '--'}
            </span>
            <select
              className={styles.inlineSelect}
              value={task.assigneeId}
              onChange={(event) =>
                handleTaskChange(task.id, {
                  assigneeId: event.target.value,
                })
              }
            >
              <option value="">Unassigned</option>
              {currentBoard.members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
        </td>
        <td>
          <input
            className={styles.inlineDate}
            type="date"
            value={task.dueDate}
            onChange={(event) => handleTaskChange(task.id, { dueDate: event.target.value })}
          />
        </td>
        <td>
          <select
            className={`${styles.inlineSelect} ${priorityClassNames[task.priority]}`}
            value={task.priority}
            onChange={(event) =>
              handleTaskChange(task.id, {
                priority: event.target.value as TaskPriority,
              })
            }
          >
            {priorityOrder.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <EditableTextField
            className={styles.notesInput}
            value={task.notes}
            onConfirm={(nextValue) => handleTaskChange(task.id, { notes: nextValue })}
            onDoubleClick={() => setDetailTaskId(task.id)}
            ariaLabel={`Task notes ${task.name}`}
          />
        </td>
        <td>
          <button type="button" className={styles.dangerButtonSmall} onClick={() => handleDeleteTask(task.id)}>
            Delete
          </button>
        </td>
      </tr>
    );
  }

  if (boardLoading) {
    return (
      <section className={styles.boardSurface}>
        <div className={styles.emptyState}>
          <p className={styles.heroEyebrow}>Loading</p>
          <h3 className={styles.heroTitle}>Loading board…</h3>
        </div>
      </section>
    );
  }

  if (!board) {
    return (
      <section className={styles.boardSurface}>
        <div className={styles.emptyState}>
          <p className={styles.heroEyebrow}>Board not found</p>
          <h3 className={styles.heroTitle}>This board could not be loaded.</h3>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.boardSurface} ${readOnly ? styles.boardReadOnly : ''}`}>
      {readOnly && (
        <div className={styles.readOnlyBanner} role="status">
          You are viewing this board as read-only. Only Admins and Members can edit.
        </div>
      )}
      <div className={`${styles.boardHeader} ${styles.boardHeaderCompact}`}>
        <div>
          <p className={styles.heroEyebrow}>{board.workspace}</p>
          {readOnly ? (
            <>
              <h2 className={styles.heroTitle}>{board.name}</h2>
              <p className={styles.heroDescription}>{board.description}</p>
            </>
          ) : (
            <>
              <EditableTextField
                className={styles.heroTitleInput}
                value={board.name}
                onConfirm={(nextValue) => handleBoardTextChange({ name: nextValue, description: board.description })}
                ariaLabel="Board name"
                placeholder="Board name"
              />
              <EditableTextField
                className={styles.heroDescriptionInput}
                value={board.description}
                onConfirm={(nextValue) => handleBoardTextChange({ name: board.name, description: nextValue })}
                ariaLabel="Board description"
                multiline
                minRows={3}
                charsPerRow={72}
                placeholder="Board description"
              />
            </>
          )}
          <div className={styles.headerHighlights}>
            <span className={styles.inlineBadge}>{allTasks.length} tasks</span>
            <span className={styles.inlineBadge}>{board.groups.length} groups</span>
            <span className={styles.inlineBadge}>{board.members.length} collaborators</span>
          </div>
        </div>

        <div className={styles.headerActions}>
          {!readOnly && (
            <button type="button" className={styles.secondaryButton} onClick={handleAddMember}>
              Add member
            </button>
          )}
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.viewerAllowed}`}
            onClick={() => window.print()}
          >
            Export PDF
          </button>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => board.groups[0] && handleAddTask(board.groups[0].id)}
            disabled={board.groups.length === 0}
          >
            New task
          </button>
        </div>
      </div>

      <ContextualHint boards={board ? [board] : []} activeBoardId={boardId} />

      <div className={`${styles.analyticsGrid} ${styles.analyticsGridCompact}`}>
        <article
          id="manage-team-roster"
          className={`${styles.insightCard} ${styles.insightCardFull} ${styles.teamRosterCompact}`}
        >
          <div className={styles.insightCardHead}>
            <div>
              <p className={styles.metricLabel}>Board members</p>
              <strong className={styles.insightTitle}>Team roster</strong>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={handleAddMember}>
              Add member
            </button>
          </div>
          <div className={styles.memberRosterTableWrap}>
            <table className={styles.memberRosterTable}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Initials</th>
                  <th>Color</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {board.members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className={styles.memberRosterNameCell}>
                        <span className={styles.avatar} style={{ background: member.color }}>
                          {member.initials}
                        </span>
                        <EditableTextField
                          className={styles.memberNameInput}
                          value={member.name}
                          onConfirm={(nextValue) => handleMemberChange(member.id, nextValue)}
                          ariaLabel={`Board member name ${member.name}`}
                        />
                      </div>
                    </td>
                    <td>
                      <span className={styles.memberInitialsTag}>{member.initials}</span>
                    </td>
                    <td>
                      <input
                        type="color"
                        className={styles.memberColorInput}
                        value={member.color}
                        onChange={(event) => handleMemberColorChange(member.id, event.target.value)}
                        aria-label={`Member color ${member.name}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => handleRemoveMember(member.id)}
                        aria-label={`Remove ${member.name}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {selectedCount > 0 ? (
        <div className={styles.bulkToolbar}>
          <div className={styles.bulkSummary}>
            <strong>{selectedCount} selected</strong>
            <span>Use bulk actions to update many tasks at once.</span>
          </div>
          <div className={styles.bulkActions}>
            <button type="button" className={styles.secondaryButton} onClick={toggleVisibleSelection}>
              {visibleTaskIds.length > 0 && visibleTaskIds.every((taskId) => selectedTaskIds.includes(taskId))
                ? 'Unselect visible'
                : 'Select visible'}
            </button>
            <select
              className={styles.controlSelect}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value as TaskStatus;
                if (!value) return;
                setConfirm({
                  open: true,
                  title: 'Bulk change status?',
                  message: `Change status of ${selectedCount} selected item(s) to "${statusLabels[value]}"?`,
                  variant: 'default',
                  onConfirm: () => {
                    applyBulkStatus(value);
                    setConfirm((c) => ({ ...c, open: false }));
                  },
                });
                event.target.value = '';
              }}
            >
              <option value="">Bulk status</option>
              {statusOrder.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <select
              className={styles.controlSelect}
              defaultValue=""
              onChange={(event) => {
                const targetGroupId = event.target.value;
                if (!targetGroupId) return;
                const targetGroup = board.groups.find((g) => g.id === targetGroupId);
                setConfirm({
                  open: true,
                  title: 'Move items?',
                  message: `Move ${selectedCount} selected item(s) to "${targetGroup?.name ?? 'group'}"?`,
                  variant: 'default',
                  onConfirm: () => {
                    applyBulkMove(targetGroupId);
                    setConfirm((c) => ({ ...c, open: false }));
                  },
                });
                event.target.value = '';
              }}
            >
              <option value="">Move to group</option>
              {board.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button type="button" className={styles.secondaryButton} onClick={() => setSelectedTaskIds([])}>
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      {viewMode === 'table' ? (
        <>
        <div id="list-of-tasks" className={styles.groupList}>
          {board.groups.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.heroEyebrow}>No segments</p>
              <h3 className={styles.heroTitle}>All segments were deleted from this board.</h3>
            </div>
          ) : (
            visibleGroups.map((group) => {
              const currentBoard = board;
              if (!currentBoard) return null;

              const progressAverage =
                group.tasks.length === 0 ? 0 : group.tasks.reduce((sum, task) => sum + task.progress, 0) / group.tasks.length;
              const groupIndex = currentBoard.groups.findIndex((item) => item.id === group.id);
              const isFirstGroup = groupIndex === 0;
              const isLastGroup = groupIndex === currentBoard.groups.length - 1;
              const activeTasks = group.tasks.filter((task) => task.status !== 'done');

              return (
                <article
                  key={group.id}
                  className={`${styles.groupCard} ${
                    tableDropTarget?.groupId === group.id && !tableDropTarget.taskId ? styles.groupCardDropActive : ''
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setTableDropTarget({ groupId: group.id });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleTableDrop(group.id);
                  }}
                >
                  <div className={styles.groupHeader}>
                    <div className={styles.groupTitleWrap}>
                      <input
                        type="checkbox"
                        checked={
                          group.tasks.length > 0 &&
                          group.tasks.every((task) => selectedTaskIds.includes(task.id))
                        }
                        onChange={() => toggleGroupSelection(group)}
                        aria-label={`Select all tasks in ${group.name}`}
                      />
                      <span
                        className={styles.groupColor}
                        style={{ background: LIST_OF_TASKS_SEGMENT_COLOR }}
                        aria-hidden
                      />
                      <div>
                        <EditableTextField
                          className={styles.groupTitleInput}
                          value={group.name}
                          onConfirm={(nextValue) => handleGroupChange(group.id, { name: nextValue })}
                          ariaLabel={`Group name ${group.name}`}
                        />
                        <p className={styles.groupSubtitle}>
                          {group.tasks.length} items, {Math.round(progressAverage)}% avg completion
                        </p>
                      </div>
                    </div>
                    <div className={styles.groupActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => handleMoveGroup(group.id, 'up')}
                        disabled={isFirstGroup}
                        aria-label={`Move ${group.name} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => handleMoveGroup(group.id, 'down')}
                        disabled={isLastGroup}
                        aria-label={`Move ${group.name} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleAddTask(group.id)}
                      >
                        Add item
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => handleDeleteGroup(group.id)}
                      >
                        Delete segment
                      </button>
                    </div>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      {taskTableHead}
                      <tbody>
                        {activeTasks.length === 0 ? (
                          <tr>
                            <td colSpan={10} className={styles.emptyActiveTasks}>
                              {group.tasks.length === 0
                                ? 'No items in this segment yet.'
                                : 'No active tasks — completed items are listed under Done tasks below.'}
                            </td>
                          </tr>
                        ) : (
                          activeTasks.map((task) => renderTaskTableRow(task, group, currentBoard))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })
          )}
        </div>
        {visibleGroups.some((g) => g.tasks.some((t) => t.status === 'done')) ? (
          <div id="done-tasks-list" className={styles.doneTasksRoot}>
            {visibleGroups.map((group) => {
              const currentBoardForDone = board;
              if (!currentBoardForDone) return null;
              const doneOnly = group.tasks.filter((t) => t.status === 'done');
              if (doneOnly.length === 0) return null;

              return (
                <article
                  key={`${group.id}-done`}
                  className={`${styles.groupCard} ${styles.doneTasksCard}`}
                >
                  <div className={styles.doneTasksSegmentHeader}>
                    <span className={styles.groupColor} style={{ background: group.color }} aria-hidden />
                    <h3 className={styles.doneTasksSegmentTitle}>Done Tasks</h3>
                    <span className={styles.doneTasksMeta}>
                      {group.name} · {doneOnly.length} completed
                    </span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table} aria-label={`Done tasks: ${group.name}`}>
                      {taskTableHead}
                      <tbody>
                        {doneOnly.map((task) => renderTaskTableRow(task, group, currentBoardForDone))}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        </>
      ) : (
        <div className={styles.kanbanGrid}>
          {kanbanColumns.map((column) => (
            <section
              key={column.status}
              className={`${styles.kanbanColumn} ${
                kanbanDropTarget?.status === column.status && !kanbanDropTarget.taskId
                  ? styles.kanbanColumnDropActive
                  : ''
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setKanbanDropTarget({ status: column.status });
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleKanbanDrop(column.status);
              }}
            >
              <div className={styles.kanbanColumnHeader}>
                <span className={`${styles.statusBadge} ${statusClassNames[column.status]}`}>
                  {statusLabels[column.status]}
                </span>
                <strong>{column.items.length}</strong>
              </div>

              <div className={styles.kanbanCards}>
                {column.items.map(({ task, group }) => {
                  const member = getMember(board, task.assigneeId);

                  return (
                    <article
                      key={task.id}
                      className={`${styles.kanbanCard} ${
                        dragState?.taskId === task.id ? styles.kanbanCardDragging : ''
                      } ${
                        selectedTaskIds.includes(task.id) ? styles.kanbanCardSelected : ''
                      } ${
                        kanbanDropTarget?.status === column.status && kanbanDropTarget.taskId === task.id
                          ? styles.kanbanCardDropActive
                          : ''
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setKanbanDropTarget({ status: column.status, taskId: task.id });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleKanbanDrop(column.status, task.id);
                      }}
                    >
                      <div className={styles.kanbanCardTop}>
                        <div className={styles.kanbanCardMeta}>
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(task.id)}
                            onChange={() => toggleTaskSelection(task.id)}
                            aria-label={`Select ${task.name}`}
                          />
                          <div
                            draggable
                            className={styles.dragHandle}
                            onDragStart={() =>
                              setDragState({
                                taskId: task.id,
                                sourceGroupId: group.id,
                                sourceStatus: task.status,
                                mode: 'kanban',
                              })
                            }
                            onDragEnd={clearDragState}
                            role="presentation"
                          >
                            ⋮⋮
                          </div>
                          <span className={styles.groupBadge}>{group.name}</span>
                        </div>
                        <div className={styles.kanbanCardMeta}>
                          <span className={`${styles.priorityBadge} ${priorityClassNames[task.priority]}`}>
                            {priorityLabels[task.priority]}
                          </span>
                          <span className={styles.dateBadge}>{formatDate(task.dueDate)}</span>
                        </div>
                      </div>
                      <input
                        className={styles.kanbanTitleInput}
                        value={task.name}
                        onChange={(event) => handleTaskChange(task.id, { name: event.target.value })}
                        aria-label={`Task name ${task.name}`}
                      />
                      <textarea
                        className={styles.kanbanNotesInput}
                        value={task.notes}
                        onChange={(event) => handleTaskChange(task.id, { notes: event.target.value })}
                        aria-label={`Task notes ${task.name}`}
                      />
                      <div className={styles.kanbanFooter}>
                        <div className={styles.personCell}>
                          <span
                            className={styles.avatar}
                            style={{ background: member?.color ?? '#d0d7f2' }}
                          >
                            {member?.initials ?? '--'}
                          </span>
                          <select
                            className={styles.inlineSelect}
                            value={task.assigneeId}
                            onChange={(event) =>
                              handleTaskChange(task.id, {
                                assigneeId: event.target.value,
                              })
                            }
                          >
                            <option value="">Unassigned</option>
                            {board.members.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <select
                          className={`${styles.inlineSelect} ${statusClassNames[task.status]}`}
                          value={task.status}
                          onChange={(event) =>
                            handleTaskChange(task.id, {
                              status: event.target.value as TaskStatus,
                            })
                          }
                        >
                          {statusOrder.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.kanbanActions}>
                        <button
                          type="button"
                          className={styles.inlineLinkButton}
                          onClick={() => setDetailTaskId(task.id)}
                        >
                          Open full info
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButtonSmall}
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}

                {column.items.length === 0 ? (
                  <div className={styles.kanbanEmpty}>Drop a task here to change its status.</div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}

      <article id="history-logs" className={`${styles.insightCard} ${styles.insightCardFull}`}>
        <div className={styles.insightCardHead}>
          <div>
            <p className={styles.metricLabel}>History logs</p>
            <strong className={styles.insightTitle}>Perubahan oleh user</strong>
          </div>
        </div>
        <div className={styles.historyLogList}>
          {(board.historyLogs ?? []).length === 0 ? (
            <p className={styles.historyLogEmpty}>Belum ada riwayat perubahan.</p>
          ) : (
            [...(board.historyLogs ?? [])]
              .reverse()
              .map((entry) => (
                <div key={entry.id} className={styles.historyLogRow}>
                  <span className={styles.historyLogTime}>
                    {new Date(entry.timestamp).toLocaleString('id-ID', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className={styles.historyLogActor}>{entry.actor}</span>
                  <span className={styles.historyLogAction}>{entry.action}</span>
                  {entry.details ? (
                    <span className={styles.historyLogDetails}>{entry.details}</span>
                  ) : null}
                </div>
              ))
          )}
        </div>
      </article>

      {detailTask ? (
        <div className={styles.detailOverlay} onClick={() => setDetailTaskId(null)} role="presentation">
          <div
            className={styles.detailModal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Task details ${detailTask.name}`}
          >
            <div className={styles.detailHeader}>
              <div>
                <p className={styles.heroEyebrow}>Item details</p>
                <h3 className={styles.detailTitle}>{detailTask.name}</h3>
              </div>
              <div className={styles.detailHeaderActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => handleDeleteTask(detailTask.id)}
                >
                  Delete item
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setDetailTaskId(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailBlock}>
                <span className={styles.metricLabel}>Full item</span>
                <p className={styles.detailContent}>{detailTask.name}</p>
              </div>
              <div className={styles.detailBlock}>
                <span className={styles.metricLabel}>Notes</span>
                <p className={styles.detailContent}>{detailTask.notes}</p>
              </div>
              <div className={styles.detailMetaRow}>
                <span className={`${styles.statusBadge} ${statusClassNames[detailTask.status]}`}>
                  {statusLabels[detailTask.status]}
                </span>
                <span className={`${styles.priorityBadge} ${priorityClassNames[detailTask.priority]}`}>
                  {priorityLabels[detailTask.priority]}
                </span>
                <span className={styles.dateBadge}>{formatDate(detailTask.dueDate)}</span>
                <span className={styles.groupBadge}>{detailTaskGroup?.name ?? 'No group'}</span>
              </div>
              <div className={styles.detailBlock}>
                <span className={styles.metricLabel}>Owner</span>
                <p className={styles.detailContent}>
                  {getMember(board, detailTask.assigneeId)?.name ?? 'Unassigned'}
                </p>
              </div>
              <div className={styles.detailBlock}>
                <span className={styles.metricLabel}>Progress</span>
                <p className={styles.detailContent}>{detailTask.progress}% complete</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
    </section>
  );
}
