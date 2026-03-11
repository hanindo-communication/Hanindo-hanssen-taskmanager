'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { priorityLabels, priorityOrder, statusLabels, statusOrder } from '@/lib/mock-data/boards';
import { loadBoardById, saveBoardAsync } from '@/lib/utils/board-storage';
import { formatDate, getMember } from '@/lib/utils/board';
import { useWorkspaceRole } from '@/lib/contexts/WorkspaceRoleContext';
import type { Board, TaskGroup, TaskItem, TaskPriority, TaskStatus, ViewMode } from '@/lib/types/board';
import styles from './board-client.module.css';

type BoardClientProps = {
  initialBoard: Board | null;
  boardId: string;
};

type StatusFilter = TaskStatus | 'all';
type PriorityFilter = TaskPriority | 'all';

type DragState = {
  taskId: string;
  sourceGroupId: string;
  sourceStatus: TaskStatus;
  mode: ViewMode;
};

const statusClassNames: Record<TaskStatus, string> = {
  workingOnIt: styles.statusWorkingOnIt,
  review: styles.statusReview,
  planned: styles.statusPlanned,
  stuck: styles.statusStuck,
  done: styles.statusDone,
};

const priorityClassNames: Record<TaskPriority, string> = {
  critical: styles.priorityCritical,
  high: styles.priorityHigh,
  medium: styles.priorityMedium,
  low: styles.priorityLow,
};

const memberColorPalette = ['#635bff', '#0073ea', '#00c875', '#fdab3d', '#ff5ac4', '#00a3ab', '#784bd1', '#ff642e'];

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
    status: 'planned',
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

function getSafeDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function getDaysUntil(date: string, referenceDate: string): number {
  const today = getSafeDate(referenceDate);
  const target = getSafeDate(date);

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tableDropTarget, setTableDropTarget] = useState<{ groupId: string; taskId?: string } | null>(null);
  const [kanbanDropTarget, setKanbanDropTarget] = useState<{ status: TaskStatus; taskId?: string } | null>(null);
  const viewMode: ViewMode = 'table';
  const allTasks = useMemo(() => board?.groups.flatMap((group) => group.tasks) ?? [], [board]);
  const todayReference = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    if (initialBoard && initialBoard.id === boardId) {
      setBoard(initialBoard);
      setBoardLoading(false);
      return;
    }
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

  useEffect(() => {
    if (!board || readOnly) return;
    const t = setTimeout(() => {
      saveBoardAsync(board);
    }, 800);
    return () => clearTimeout(t);
  }, [board, readOnly]);

  const visibleGroups = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (board?.groups ?? [])
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) => {
          const matchesSearch =
            normalizedSearch.length === 0 ||
            task.name.toLowerCase().includes(normalizedSearch) ||
            task.notes.toLowerCase().includes(normalizedSearch);
          const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
          const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
          const matchesAssignee = assigneeFilter === 'all' || task.assigneeId === assigneeFilter;
          return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
        }),
      }));
  }, [assigneeFilter, board, priorityFilter, searchTerm, statusFilter]);

  const visibleTasks = useMemo(() => visibleGroups.flatMap((group) => group.tasks), [visibleGroups]);
  const completedTasks = useMemo(() => allTasks.filter((task) => task.status === 'done').length, [allTasks]);
  const overallProgress = useMemo(() => {
    if (allTasks.length === 0) {
      return 0;
    }

    return Math.round(allTasks.reduce((sum, task) => sum + task.progress, 0) / allTasks.length);
  }, [allTasks]);
  const overdueCount = useMemo(
    () => allTasks.filter((task) => task.status !== 'done' && getDaysUntil(task.dueDate, todayReference) < 0).length,
    [allTasks, todayReference],
  );
  const statusMetrics = useMemo(
    () =>
      statusOrder.map((status) => ({
        status,
        count: allTasks.filter((task) => task.status === status).length,
      })),
    [allTasks],
  );
  const memberLoad = useMemo(
    () =>
      (board?.members ?? [])
        .map((member) => {
          const assignedTasks = allTasks.filter((task) => task.assigneeId === member.id && task.status !== 'done');
          const averageProgress =
            assignedTasks.length === 0
              ? 0
              : Math.round(assignedTasks.reduce((sum, task) => sum + task.progress, 0) / assignedTasks.length);

          return {
            member,
            activeTasks: assignedTasks.length,
            averageProgress,
          };
        })
        .sort((left, right) => right.activeTasks - left.activeTasks || right.averageProgress - left.averageProgress),
    [allTasks, board],
  );
  const completionRate = allTasks.length === 0 ? 0 : Math.round((completedTasks / allTasks.length) * 100);
  const progressRing = {
    background: `conic-gradient(var(--brand) ${overallProgress * 3.6}deg, rgba(99, 91, 255, 0.12) 0deg)`,
  };

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

  function updateCurrentBoard(updater: (currentBoard: Board) => Board) {
    setBoard((currentBoard) => (currentBoard ? updater(currentBoard) : currentBoard));
  }

  function handleTaskChange(taskId: string, updates: Partial<TaskItem>) {
    updateCurrentBoard((currentBoard) =>
      updateTask(currentBoard, taskId, (task) => ({
        ...task,
        ...updates,
      })),
    );
  }

  function handleGroupChange(groupId: string, updates: Partial<TaskGroup>) {
    updateCurrentBoard((currentBoard) =>
      updateGroup(currentBoard, groupId, (group) => ({
        ...group,
        ...updates,
      })),
    );
  }

  function handleMemberChange(memberId: string, name: string) {
    updateCurrentBoard((currentBoard) =>
      updateMember(currentBoard, memberId, (member) => ({
        ...member,
        name,
        initials: getInitials(name) || member.initials,
      })),
    );
  }

  function handleMemberColorChange(memberId: string, color: string) {
    updateCurrentBoard((currentBoard) =>
      updateMember(currentBoard, memberId, (member) => ({
        ...member,
        color,
      })),
    );
  }

  function handleAddMember() {
    updateCurrentBoard((currentBoard) => ({
      ...currentBoard,
      members: [...currentBoard.members, buildNewMember(currentBoard.members.length)],
    }));
  }

  function handleRemoveMember(memberId: string) {
    setAssigneeFilter((current) => (current === memberId ? 'all' : current));
    updateCurrentBoard((currentBoard) => ({
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
    }));
  }

  function handleBoardTextChange(updates: Pick<Board, 'name' | 'description'>) {
    updateCurrentBoard((currentBoard) => ({
      ...currentBoard,
      ...updates,
    }));
  }

  function handleDeleteTask(taskId: string) {
    setSelectedTaskIds((current) => current.filter((id) => id !== taskId));
    setDetailTaskId((current) => (current === taskId ? null : current));
    updateCurrentBoard((currentBoard) => deleteTask(currentBoard, taskId));
  }

  function handleDeleteGroup(groupId: string) {
    const taskIdsToRemove = board?.groups.find((group) => group.id === groupId)?.tasks.map((task) => task.id) ?? [];

    setSelectedTaskIds((current) => current.filter((id) => !taskIdsToRemove.includes(id)));
    setDetailTaskId((current) => (current && taskIdsToRemove.includes(current) ? null : current));
    setCollapsedGroups((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    updateCurrentBoard((currentBoard) => deleteGroup(currentBoard, groupId));
  }

  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    updateCurrentBoard((currentBoard) => moveGroup(currentBoard, groupId, direction));
  }

  function handleAddTask(groupId: string) {
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
    }));
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
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
    updateCurrentBoard((currentBoard) => {
      let nextBoard = currentBoard;

      selectedTaskIds.forEach((taskId) => {
        nextBoard = updateTaskStatus(nextBoard, taskId, status);
      });

      return nextBoard;
    });
  }

  function applyBulkMove(targetGroupId: string) {
    updateCurrentBoard((currentBoard) => {
      let nextBoard = currentBoard;

      selectedTaskIds.forEach((taskId) => {
        nextBoard = moveTaskBetweenGroups(nextBoard, taskId, targetGroupId);
      });

      return nextBoard;
    });
  }

  function handleTableDrop(targetGroupId: string, targetTaskId?: string) {
    if (!dragState) {
      return;
    }

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
    });

    clearDragState();
  }

  function handleKanbanDrop(targetStatus: TaskStatus, targetTaskId?: string) {
    if (!dragState) {
      return;
    }

    updateCurrentBoard((currentBoard) => {
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
    });

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
      <div className={styles.boardHeader}>
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

      <div className={styles.analyticsGrid}>
        <article className={styles.insightCard}>
          <div className={styles.insightCardHead}>
            <div>
              <p className={styles.metricLabel}>Team load</p>
              <strong className={styles.insightTitle}>Workload by owner</strong>
            </div>
          </div>
          <div className={styles.loadList}>
            {memberLoad.map(({ member, activeTasks, averageProgress }) => (
              <div key={member.id} className={styles.loadItem}>
                <div className={styles.loadHeader}>
                  <div className={styles.personCell}>
                    <span className={styles.avatar} style={{ background: member.color }}>
                      {member.initials}
                    </span>
                    <div>
                      <EditableTextField
                        className={styles.memberNameInput}
                        value={member.name}
                        onConfirm={(nextValue) => handleMemberChange(member.id, nextValue)}
                        ariaLabel={`Member name ${member.name}`}
                      />
                      <p>{activeTasks} active tasks</p>
                    </div>
                  </div>
                  <span className={styles.loadValue}>{averageProgress}%</span>
                </div>
                <div className={styles.storyBar}>
                  <span style={{ width: `${averageProgress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className={`${styles.insightCard} ${styles.insightCardAccent}`}>
          <div className={styles.insightCardHead}>
            <div>
              <p className={styles.metricLabel}>Task health</p>
              <strong className={styles.insightTitle}>Execution snapshot</strong>
            </div>
            <span className={styles.inlineBadge}>{completionRate}% completed</span>
          </div>
          <div className={styles.healthGrid}>
            <div className={styles.progressRingWrap}>
              <div className={styles.progressRing} style={progressRing}>
                <div className={styles.progressRingInner}>
                  <strong>{overallProgress}%</strong>
                  <span>avg progress</span>
                </div>
              </div>
            </div>
            <div className={styles.statusLegend}>
              {statusMetrics.map((item) => (
                <div key={item.status} className={styles.legendRow}>
                  <span className={`${styles.legendDot} ${statusClassNames[item.status]}`} />
                  <span>{statusLabels[item.status]}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article id="manage-team-roster" className={`${styles.insightCard} ${styles.insightCardFull}`}>
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

      <div className={styles.toolbar}>
        <div className={styles.toolbarControls}>
          <input
            type="search"
            className={styles.controlInput}
            placeholder="Search tasks or notes"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            className={styles.controlSelect}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            {statusOrder.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <select
            className={styles.controlSelect}
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="all">All owners</option>
            {board.members.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select
            className={styles.controlSelect}
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
          >
            <option value="all">All priorities</option>
            {priorityOrder.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
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
                if (event.target.value) {
                  applyBulkStatus(event.target.value as TaskStatus);
                  event.target.value = '';
                }
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
                if (event.target.value) {
                  applyBulkMove(event.target.value);
                  event.target.value = '';
                }
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

      <div className={styles.summaryBar}>
        <span>{visibleTasks.length} visible tasks</span>
        <span>{visibleGroups.length} active groups</span>
        <span>{overdueCount} overdue items</span>
        <span>{board.members.length} collaborators</span>
        <span className={styles.dragHint}>Drag rows to reorder or move tasks between groups</span>
        <button type="button" className={styles.secondaryButton} onClick={toggleVisibleSelection}>
          {visibleTaskIds.length > 0 && visibleTaskIds.every((taskId) => selectedTaskIds.includes(taskId))
            ? 'Unselect visible'
            : 'Select visible'}
        </button>
      </div>

      {viewMode === 'table' ? (
        <div id="list-of-tasks" className={styles.groupList}>
          {board.groups.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.heroEyebrow}>No segments</p>
              <h3 className={styles.heroTitle}>All segments were deleted from this board.</h3>
            </div>
          ) : (
            visibleGroups.map((group) => {
              const isCollapsed = collapsedGroups[group.id];
              const progressAverage =
                group.tasks.length === 0 ? 0 : group.tasks.reduce((sum, task) => sum + task.progress, 0) / group.tasks.length;
              const groupIndex = board.groups.findIndex((item) => item.id === group.id);
              const isFirstGroup = groupIndex === 0;
              const isLastGroup = groupIndex === board.groups.length - 1;

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
                      <button
                        type="button"
                        className={styles.collapseButton}
                        onClick={() => toggleGroup(group.id)}
                      >
                        {isCollapsed ? '+' : '-'}
                      </button>
                      <span className={styles.groupColor} style={{ background: group.color }} />
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

                  {!isCollapsed ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.checkboxColumn}>Pick</th>
                            <th className={styles.dragColumn}>Move</th>
                            <th>Item</th>
                            <th>Status</th>
                            <th>Owner</th>
                            <th>Due date</th>
                            <th>Priority</th>
                            <th>Progress</th>
                            <th>Notes</th>
                            <th>Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.tasks.map((task) => {
                            const member = getMember(board, task.assigneeId);

                            return (
                              <tr
                                key={task.id}
                                className={`${styles.taskRow} ${
                                  dragState?.taskId === task.id ? styles.taskRowDragging : ''
                                } ${
                                  tableDropTarget?.groupId === group.id && tableDropTarget.taskId === task.id
                                    ? styles.taskRowDropActive
                                    : ''
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
                                </td>
                                <td>
                                  <input
                                    className={styles.inlineDate}
                                    type="date"
                                    value={task.dueDate}
                                    onChange={(event) =>
                                      handleTaskChange(task.id, { dueDate: event.target.value })
                                    }
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
                                  <div className={styles.progressCell}>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={task.progress}
                                      onChange={(event) =>
                                        handleTaskChange(task.id, {
                                          progress: Number(event.target.value),
                                        })
                                      }
                                    />
                                    <span>{task.progress}%</span>
                                  </div>
                                </td>
                                <td>
                                  <EditableTextField
                                    className={styles.notesInput}
                                    value={task.notes}
                                    onConfirm={(nextValue) => handleTaskChange(task.id, { notes: nextValue })}
                                    ariaLabel={`Task notes ${task.name}`}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.dangerButtonSmall}
                                    onClick={() => handleDeleteTask(task.id)}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
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
    </section>
  );
}
