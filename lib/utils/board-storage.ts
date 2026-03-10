'use client';

import { createClient } from '@/lib/supabase/client';
import {
  fetchBoardsFromSupabase,
  fetchBoardByIdFromSupabase,
  saveBoardToSupabase,
  deleteBoardFromSupabase,
  createBoardFromTemplateInSupabase,
} from '@/lib/supabase/boards';
import { workspaceTitle } from '@/lib/constants/workspace';
import { defaultBoardId } from '@/lib/mock-data/boards';
import type { Board } from '@/lib/types/board';

function isSupabaseConfigured(): boolean {
  return createClient() !== null;
}

const BOARD_STORAGE_KEY = 'task-manager.boards';
const DELETED_BOARD_IDS_KEY = 'task-manager.deleted-board-ids';
export const BOARD_STORAGE_EVENT = 'task-manager:boards-updated';

function normalizeBoard(board: Board): Board {
  const normalizedGroups =
    board.id === defaultBoardId
      ? board.groups
          .filter((group) => group.id !== 'launch-readiness')
          .map((group) =>
            group.id === 'launch-assets'
              ? {
                  ...group,
                  name: 'List of Tasks',
                }
              : group,
          )
      : board.groups;

  return {
    ...board,
    workspace: workspaceTitle,
    groups: normalizedGroups,
  };
}

function dispatchBoardsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BOARD_STORAGE_EVENT));
  }
}

function loadDeletedBoardIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DELETED_BOARD_IDS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function saveDeletedBoardIds(boardIds: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DELETED_BOARD_IDS_KEY, JSON.stringify(Array.from(new Set(boardIds))));
}

export function loadStoredBoards(): Board[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Board[];

    return Array.isArray(parsed) ? parsed.map(normalizeBoard) : [];
  } catch {
    return [];
  }
}

export function mergeBoards(staticBoards: Board[], storedBoards = loadStoredBoards()): Board[] {
  const boardMap = new Map<string, Board>();
  const deletedBoardIds = new Set(loadDeletedBoardIds());

  staticBoards.forEach((board) => {
    if (!deletedBoardIds.has(board.id)) {
      boardMap.set(board.id, normalizeBoard(board));
    }
  });
  storedBoards.forEach((board) => {
    if (!deletedBoardIds.has(board.id)) {
      boardMap.set(board.id, normalizeBoard(board));
    }
  });

  return Array.from(boardMap.values());
}

export function getStoredBoardById(boardId: string): Board | undefined {
  return loadStoredBoards().find((board) => board.id === boardId);
}

export function saveBoard(board: Board) {
  if (typeof window === 'undefined') {
    return;
  }

  const currentBoards = loadStoredBoards();
  const deletedBoardIds = loadDeletedBoardIds().filter((boardId) => boardId !== board.id);
  const nextBoards = [...currentBoards.filter((item) => item.id !== board.id), normalizeBoard(board)];
  window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(nextBoards));
  saveDeletedBoardIds(deletedBoardIds);
  dispatchBoardsUpdated();
}

export function deleteBoard(boardId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const currentBoards = loadStoredBoards();
  const nextBoards = currentBoards.filter((board) => board.id !== boardId);
  const deletedBoardIds = [...loadDeletedBoardIds(), boardId];
  window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(nextBoards));
  saveDeletedBoardIds(deletedBoardIds);
  dispatchBoardsUpdated();
}

export function createBoardFromTemplate(template: Board, existingBoards: Board[], name?: string): Board {
  const timestamp = Date.now();
  const label = existingBoards.length + 1;
  const templateBase = template.groups.length > 0 ? template : existingBoards.find((board) => board.id === defaultBoardId) ?? template;
  const nextBoardName = name?.trim() || `New Board ${label}`;

  return normalizeBoard({
    ...templateBase,
    id: `board-${timestamp}`,
    name: nextBoardName,
    description: 'New board ready for planning and task assignment.',
    workspace: workspaceTitle,
    favorites: false,
    groups: templateBase.groups.map((group, index) => ({
      ...group,
      id: `${timestamp}-group-${index}`,
      tasks: [],
    })),
    members: templateBase.members.map((member, index) => ({
      ...member,
      id: `${timestamp}-member-${index}`,
    })),
    stats: {
      completionRate: 0,
      dueThisWeek: 0,
      activeAutomations: 0,
    },
  });
}

// --- Async API: uses Supabase when configured, else localStorage (sync) ---

export async function loadBoards(): Promise<Board[]> {
  if (typeof window === 'undefined') return [];
  if (isSupabaseConfigured()) {
    try {
      return await fetchBoardsFromSupabase();
    } catch {
      return loadStoredBoards();
    }
  }
  return loadStoredBoards();
}

export async function loadBoardById(boardId: string): Promise<Board | null> {
  if (typeof window === 'undefined') return null;
  if (isSupabaseConfigured()) {
    try {
      return await fetchBoardByIdFromSupabase(boardId);
    } catch {
      return getStoredBoardById(boardId) ?? null;
    }
  }
  return getStoredBoardById(boardId) ?? null;
}

export async function saveBoardAsync(board: Board): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isSupabaseConfigured()) {
    try {
      await saveBoardToSupabase(board);
    } catch {
      saveBoard(board);
    }
    dispatchBoardsUpdated();
    return;
  }
  saveBoard(board);
}

/** Mark a board as deleted so mergeBoards won't show it again (e.g. after Supabase delete). */
export function addToDeletedBoardIds(boardId: string): void {
  if (typeof window === 'undefined') return;
  const next = [...loadDeletedBoardIds(), boardId];
  saveDeletedBoardIds(next);
}

export async function deleteBoardAsync(boardId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isSupabaseConfigured()) {
    try {
      await deleteBoardFromSupabase(boardId);
      addToDeletedBoardIds(boardId);
    } catch {
      deleteBoard(boardId);
    }
    dispatchBoardsUpdated();
    return;
  }
  deleteBoard(boardId);
}

export async function createBoardFromTemplateAsync(
  template: Board,
  existingBoards: Board[],
  name?: string
): Promise<Board> {
  if (typeof window === 'undefined') {
    return createBoardFromTemplate(template, existingBoards, name);
  }
  if (isSupabaseConfigured()) {
    try {
      return await createBoardFromTemplateInSupabase(template, existingBoards, name);
    } catch {
      const next = createBoardFromTemplate(template, existingBoards, name);
      saveBoard(next);
      return next;
    }
  }
  const next = createBoardFromTemplate(template, existingBoards, name);
  saveBoard(next);
  return next;
}
