'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { workspaceTitle } from '@/lib/constants/workspace';
import { defaultBoardId } from '@/lib/mock-data/boards';
import {
  loadBoards,
  mergeBoards,
  saveBoardAsync,
  deleteBoardAsync,
  createBoardFromTemplateAsync,
  BOARD_STORAGE_EVENT,
} from '@/lib/utils/board-storage';
import { getBoards } from '@/lib/utils/board';
import {
  loadWorkspaceMembers,
  getRoleForEmail,
  WORKSPACE_MEMBERS_EVENT,
} from '@/lib/utils/workspace-members';
import { WorkspaceRoleProvider } from '@/lib/contexts/WorkspaceRoleContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Board, MemberRole } from '@/lib/types/board';
import { getTimeBasedGreeting, getDisplayName } from '@/lib/utils/greeting';
import styles from './app-shell.module.css';

const PENDING_NEW_BOARD_KEY = 'task-manager.pendingNewBoard';

function getPendingNewBoard(): Board | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_NEW_BOARD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Board;
  } catch {
    return null;
  }
}

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  variant: 'danger' | 'default';
  onConfirm: () => void;
};

type AppShellProps = {
  children: React.ReactNode;
  activeBoardId?: string;
  activeSection?: 'overview' | 'settings' | 'report-generator' | 'chat-generator';
};

const motivationQuotes = [
  'One focused step today can unlock a calmer tomorrow. Keep moving.',
  'You do not need perfect energy to make meaningful progress. Start with one task.',
  'Small wins still count. Finish one thing, then build from there.',
  'Your work matters. Show up, do the next right thing, and trust the process.',
  'Discipline beats mood. A little consistency today becomes momentum tomorrow.',
  'Take a breath, reset your mind, and attack the work with steady confidence.',
  'You are closer than you think. Keep going until the task becomes a result.',
  'Progress is made by people who continue even when it feels ordinary.',
  'Do not wait for motivation to arrive. Action is what invites motivation in.',
  'One clear task, one clean finish, one stronger version of you.',
];

export function AppShell({ children, activeBoardId, activeSection }: AppShellProps) {
  const router = useRouter();
  const staticBoards = useMemo(() => getBoards(), []);
  const [boards, setBoards] = useState(staticBoards);
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isProjectEditMode, setIsProjectEditMode] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [isMotivationOpen, setIsMotivationOpen] = useState(false);
  const [motivationQuote, setMotivationQuote] = useState(motivationQuotes[0]);
  const [user, setUser] = useState<User | null>(null);
  const [openDropdownBoardId, setOpenDropdownBoardId] = useState<string | null>(null);
  const [isFavoritesEditMode, setIsFavoritesEditMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
  });
  const [workspaceMembers, setWorkspaceMembers] = useState<{ id: string; email: string; name: string; role: MemberRole }[]>([]);
  const userRole: MemberRole | null = useMemo(() => {
    if (workspaceMembers.length === 0) return 'admin'; // first-time: allow full access to set up
    return getRoleForEmail(workspaceMembers, user?.email ?? undefined) ?? 'viewer';
  }, [workspaceMembers, user?.email]);
  const canEdit = userRole === 'admin' || userRole === 'member';
  const canDeleteBoard = userRole === 'admin';

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setUser(null);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function syncMembers() {
      loadWorkspaceMembers().then(setWorkspaceMembers);
    }
    syncMembers();
    window.addEventListener(WORKSPACE_MEMBERS_EVENT, syncMembers);
    return () => window.removeEventListener(WORKSPACE_MEMBERS_EVENT, syncMembers);
  }, []);

  useEffect(() => {
    function syncBoards() {
      loadBoards().then((stored) => {
        // #region agent log
        const merged = mergeBoards(staticBoards, stored);
        fetch('http://127.0.0.1:7751/ingest/9bcdc013-77cc-4766-ab50-abbe97a27379',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8284e'},body:JSON.stringify({sessionId:'e8284e',location:'app-shell.tsx:syncBoards',message:'syncBoards applying',data:{storedLen:stored.length,mergedLen:merged.length},timestamp:Date.now(),hypothesisId:'H3,H4'})}).catch(()=>{});
        // #endregion
        const pending = getPendingNewBoard();
        let base = mergeBoards(staticBoards, stored);
        if (pending) {
          base = mergeBoards(base, [pending]);
          // Only clear pending when backend already has this board (so later syncs won't drop it)
          if (stored.some((b) => b.id === pending.id)) {
            try {
              sessionStorage.removeItem(PENDING_NEW_BOARD_KEY);
            } catch {}
          }
        }
        setBoards((current) => mergeBoards(base, current));
      });
    }

    syncBoards();
    window.addEventListener(BOARD_STORAGE_EVENT, syncBoards);
    window.addEventListener('storage', syncBoards);

    return () => {
      window.removeEventListener(BOARD_STORAGE_EVENT, syncBoards);
      window.removeEventListener('storage', syncBoards);
    };
  }, [staticBoards]);

  function openCreateBoardModal() {
    setNewBoardName(`New Project ${boards.length + 1}`);
    setIsCreateBoardOpen(true);
  }

  function closeCreateBoardModal() {
    setIsCreateBoardOpen(false);
    setNewBoardName('');
  }

  async function handleCreateBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // #region agent log
    fetch('http://127.0.0.1:7751/ingest/9bcdc013-77cc-4766-ab50-abbe97a27379',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8284e'},body:JSON.stringify({sessionId:'e8284e',location:'app-shell.tsx:handleCreateBoard:entry',message:'Create board started',data:{boardsLen:boards.length,newBoardName:newBoardName?.slice(0,50),activeBoardId:activeBoardId ?? null},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const templateBoard =
      staticBoards.find((board) => board.id === activeBoardId) ??
      staticBoards.find((board) => board.id === defaultBoardId) ??
      staticBoards[0];

    if (!templateBoard) {
      // #region agent log
      fetch('http://127.0.0.1:7751/ingest/9bcdc013-77cc-4766-ab50-abbe97a27379',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8284e'},body:JSON.stringify({sessionId:'e8284e',location:'app-shell.tsx:handleCreateBoard:noTemplate',message:'No template board',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return;
    }

    let nextBoard: Awaited<ReturnType<typeof createBoardFromTemplateAsync>>;
    try {
      nextBoard = await createBoardFromTemplateAsync(templateBoard, boards, newBoardName);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7751/ingest/9bcdc013-77cc-4766-ab50-abbe97a27379',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8284e'},body:JSON.stringify({sessionId:'e8284e',location:'app-shell.tsx:handleCreateBoard:createThrow',message:'createBoardFromTemplateAsync threw',data:{err: String(err)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      throw err;
    }

    // #region agent log
    const merged = mergeBoards(boards, [nextBoard]);
    const hasNewBoard = merged.some((b) => b.id === nextBoard.id);
    fetch('http://127.0.0.1:7751/ingest/9bcdc013-77cc-4766-ab50-abbe97a27379',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8284e'},body:JSON.stringify({sessionId:'e8284e',location:'app-shell.tsx:handleCreateBoard:afterCreate',message:'After create, before setState',data:{nextBoardId:nextBoard.id,nextBoardName:nextBoard.name,mergedLen:merged.length,hasNewBoard},timestamp:Date.now(),hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion

    closeCreateBoardModal();
    // So syncBoards (e.g. after nav/remount) keeps the new board in the list until refetch has it
    try {
      sessionStorage.setItem(PENDING_NEW_BOARD_KEY, JSON.stringify(nextBoard));
    } catch {}
    const fresh = await loadBoards();
    const nextList = mergeBoards(mergeBoards(staticBoards, fresh), [nextBoard]);
    flushSync(() => setBoards(nextList));
    setTimeout(() => router.push(`/boards/${nextBoard.id}`), 0);
  }

  function requestDeleteBoard(boardId: string) {
    const board = boards.find((b) => b.id === boardId);
    setConfirm({
      open: true,
      title: 'Delete project?',
      message: `"${board?.name ?? 'This project'}" and all its data will be permanently removed. This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        await deleteBoardAsync(boardId);
        setBoards((current) => current.filter((board) => board.id !== boardId));
        setConfirm((c) => ({ ...c, open: false }));
        if (activeBoardId === boardId) {
          router.push('/');
        }
      },
    });
  }

  function requestRemoveFromFavorites(boardId: string) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return;
    setConfirm({
      open: true,
      title: 'Remove from Favorites?',
      message: `Remove "${board.name}" from your Favorites list? You can still find it under Programs/Projects.`,
      variant: 'default',
      onConfirm: async () => {
        setOpenDropdownBoardId((id) => (id === boardId ? null : id));
        await saveBoardAsync({ ...board, favorites: false });
        setBoards((current) =>
          current.map((b) => (b.id === boardId ? { ...b, favorites: false } : b))
        );
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function handleGenerateMotivation() {
    if (isMotivationOpen) {
      setIsMotivationOpen(false);
      return;
    }

    setMotivationQuote((currentQuote) => {
      const availableQuotes = motivationQuotes.filter((quote) => quote !== currentQuote);

      if (availableQuotes.length === 0) {
        return currentQuote;
      }

      return availableQuotes[Math.floor(Math.random() * availableQuotes.length)];
    });
    setIsMotivationOpen(true);
  }

  return (
    <WorkspaceRoleProvider role={userRole}>
    <div className={`${styles.shell} ${isSidebarCollapsed ? styles.sidebarCollapsedShell : ''}`}>
      <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`} aria-label="Sidebar navigation">
        <div className={styles.brandBlock}>
          <div className={styles.brandIcon}>TM</div>
          {!isSidebarCollapsed && (
            <div className={styles.brandText}>
              <p className={styles.brandEyebrow}>Workspace</p>
              <h1 className={styles.brandTitle}>{workspaceTitle}</h1>
            </div>
          )}
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          >
            {isSidebarCollapsed ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
          </button>
        </div>

        <div className={styles.sidebarSection}>
          {!isSidebarCollapsed && (
            <div className={styles.sectionHeader}>
              <p className={styles.sectionLabel}>Favorites</p>
              {canEdit && (
                <button
                  type="button"
                  className={styles.sectionActionButton}
                  onClick={() => setIsFavoritesEditMode((current) => !current)}
                >
                  {isFavoritesEditMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
          )}
          {isSidebarCollapsed ? (
            <>
              <Link className={`${styles.navItemIcon} ${activeSection === 'overview' ? styles.navItemActive : ''}`} href="/" title="Overview" aria-label="Overview">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              </Link>
              <Link className={`${styles.navItemIcon} ${activeSection === 'settings' ? styles.navItemActive : ''}`} href="/settings" title="Settings" aria-label="Settings">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              </Link>
              <Link className={`${styles.navItemIcon} ${activeSection === 'report-generator' ? styles.navItemActive : ''}`} href="/report-generator" title="Report Generator" aria-label="Report Generator">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              </Link>
              <Link className={`${styles.navItemIcon} ${activeSection === 'chat-generator' ? styles.navItemActive : ''}`} href="/chat-generator" title="Mbah Dukun" aria-label="Mbah Dukun">
                <span className={styles.navIconEmoji} aria-hidden="true">👵</span>
              </Link>
              <div className={styles.sectionIconLabel} title="Favorites">
                <span className={styles.sectionIcon} aria-hidden="true">★</span>
              </div>
            </>
          ) : (
            <>
          <Link
            className={`${styles.navItem} ${activeSection === 'overview' ? styles.navItemActive : ''}`}
            href="/"
          >
            Overview
          </Link>
          <Link
            className={`${styles.navItem} ${activeSection === 'settings' ? styles.navItemActive : ''}`}
            href="/settings"
          >
            Settings
          </Link>
          <Link
            className={`${styles.navItem} ${activeSection === 'report-generator' ? styles.navItemActive : ''}`}
            href="/report-generator"
          >
            Report Generator
          </Link>
          <Link
            className={`${styles.navItem} ${activeSection === 'chat-generator' ? styles.navItemActive : ''}`}
            href="/chat-generator"
          >
            👵 Mbah Dukun
          </Link>
            </>
          )}
          {isSidebarCollapsed
            ? boards.filter((board) => board.favorites).map((board) => (
                <Link
                  key={board.id}
                  href={`/boards/${board.id}`}
                  className={`${styles.navItemPill} ${activeBoardId === board.id ? styles.navItemActive : ''}`}
                  title={board.name}
                  aria-label={board.name}
                >
                  {board.name.slice(0, 1).toUpperCase()}
                </Link>
              ))
            : null}
          {!isSidebarCollapsed && boards
            .filter((board) => board.favorites)
            .map((board) =>
              isFavoritesEditMode ? (
                <div
                  key={board.id}
                  className={`${styles.navItem} ${styles.navItemEditable} ${
                    activeBoardId === board.id ? styles.navItemActive : ''
                  }`}
                >
                  <span className={styles.navItemLink}>
                    <span className={styles.navDot} />
                    <span className={styles.navItemLabel}>{board.name}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.removeFromFavoritesButton}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requestRemoveFromFavorites(board.id);
                    }}
                    aria-label={`Remove ${board.name} from Favorites`}
                    title="Remove from Favorites"
                  >
                    −
                  </button>
                  {canDeleteBoard && (
                    <button
                      type="button"
                      className={styles.deleteIconButton}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        requestDeleteBoard(board.id);
                      }}
                      aria-label={`Delete ${board.name}`}
                      title="Delete project"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.deleteIcon}>
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <div
                  key={board.id}
                  className={`${styles.navItem} ${styles.navItemWithDropdown} ${
                    activeBoardId === board.id ? styles.navItemActive : ''
                  }`}
                >
                  <Link href={`/boards/${board.id}`} className={styles.navItemLink}>
                    <span className={styles.navDot} />
                    <span className={styles.navItemLabel}>{board.name}</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.navItemDropdownTrigger}
                    onClick={() => setOpenDropdownBoardId((id) => (id === board.id ? null : board.id))}
                    aria-expanded={openDropdownBoardId === board.id}
                    aria-haspopup="true"
                    aria-label={`Toggle menu for ${board.name}`}
                  >
                    {openDropdownBoardId === board.id ? '▲' : '▼'}
                  </button>
                  {openDropdownBoardId === board.id ? (
                    <div className={styles.navItemDropdown}>
                      <Link
                        className={styles.navItemDropdownLink}
                        href={`/boards/${board.id}#manage-team-roster`}
                        onClick={() => setOpenDropdownBoardId(null)}
                      >
                        Team roster
                      </Link>
                      <Link
                        className={styles.navItemDropdownLink}
                        href={`/boards/${board.id}#list-of-tasks`}
                        onClick={() => setOpenDropdownBoardId(null)}
                      >
                        List of tasks
                      </Link>
                    </div>
                  ) : null}
                </div>
              )
            )}
        </div>

        <div className={styles.sidebarSection}>
          {isSidebarCollapsed ? (
            <>
              <div className={styles.sectionIconLabel} title="Programs/Projects">
                <span className={styles.sectionIcon} aria-hidden="true">📁</span>
              </div>
              {boards.map((board) => (
                <Link
                  key={board.id}
                  href={`/boards/${board.id}`}
                  className={`${styles.navItemPill} ${activeBoardId === board.id ? styles.navItemActive : ''}`}
                  title={board.name}
                  aria-label={board.name}
                >
                  {board.name.slice(0, 1).toUpperCase()}
                </Link>
              ))}
            </>
          ) : (
            <>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Programs/Projects</p>
            {canEdit && (
              <button
                type="button"
                className={styles.sectionActionButton}
                onClick={() => setIsProjectEditMode((current) => !current)}
              >
                {isProjectEditMode ? 'Done' : 'Edit'}
              </button>
            )}
          </div>
          {boards.map((board) =>
            isProjectEditMode ? (
              <div
                key={board.id}
                className={`${styles.navItem} ${styles.navItemEditable} ${
                  activeBoardId === board.id ? styles.navItemActive : ''
                }`}
              >
                <span className={styles.navItemLink}>
                  <span className={styles.workspacePill}>{board.workspace.slice(0, 1)}</span>
                  <span className={styles.navItemLabel}>{board.name}</span>
                </span>
                {canDeleteBoard && (
                  <button
                    type="button"
                    className={styles.deleteIconButton}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requestDeleteBoard(board.id);
                    }}
                    aria-label={`Delete ${board.name}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.deleteIcon}>
                      <path
                        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <div
                key={board.id}
                className={`${styles.navItem} ${styles.navItemWithDropdown} ${
                  activeBoardId === board.id ? styles.navItemActive : ''
                }`}
              >
                <Link href={`/boards/${board.id}`} className={styles.navItemLink}>
                  <span className={styles.workspacePill}>{board.workspace.slice(0, 1)}</span>
                  <span className={styles.navItemLabel}>{board.name}</span>
                </Link>
                <button
                  type="button"
                  className={styles.navItemDropdownTrigger}
                  onClick={() => setOpenDropdownBoardId((id) => (id === board.id ? null : board.id))}
                  aria-expanded={openDropdownBoardId === board.id}
                  aria-haspopup="true"
                  aria-label={`Toggle menu for ${board.name}`}
                >
                  {openDropdownBoardId === board.id ? '▲' : '▼'}
                </button>
                {openDropdownBoardId === board.id ? (
                  <div className={styles.navItemDropdown}>
                    <Link
                      className={styles.navItemDropdownLink}
                      href={`/boards/${board.id}#manage-team-roster`}
                      onClick={() => setOpenDropdownBoardId(null)}
                    >
                      Team roster
                    </Link>
                    <Link
                      className={styles.navItemDropdownLink}
                      href={`/boards/${board.id}#list-of-tasks`}
                      onClick={() => setOpenDropdownBoardId(null)}
                    >
                      List of tasks
                    </Link>
                  </div>
                ) : null}
              </div>
            ),
          )}
            </>
          )}
        </div>

        {!isSidebarCollapsed && (
        <div className={styles.sidebarFooter}>
          <div className={styles.teamCard}>
            <p className={styles.teamLabel}>This week</p>
            <strong>12 updates synced</strong>
            <span>All boards running from local demo data.</span>
          </div>
        </div>
        )}
      </aside>

      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.topbarLabel}>Collaborative workspace</p>
            <strong className={styles.topbarTitle}>
              {getTimeBasedGreeting()}
              {user ? (getDisplayName(user) ? `, ${getDisplayName(user)}` : '!') : '!'}
            </strong>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.searchWrap}>
              <input
                aria-label="Global search"
                className={styles.searchInput}
                defaultValue="Search everything"
                readOnly
              />
            </div>
            {canEdit && (
              <button className={styles.primaryButton} type="button" onClick={openCreateBoardModal}>
                New project
              </button>
            )}
            {user ? (
              <div className={styles.userMenu}>
                <span className={styles.userBubble} title={user.email ?? undefined}>
                  {(user.email ?? '?').slice(0, 2).toUpperCase()}
                </span>
                <button
                  type="button"
                  className={styles.userLogoutButton}
                  onClick={handleSignOut}
                  aria-label="Sign out"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className={styles.userBubble}>--</div>
            )}
          </div>
        </header>

        <main className={styles.main}>{children}</main>
      </div>

      {isCreateBoardOpen ? (
        <div className={styles.modalOverlay} onClick={closeCreateBoardModal} role="presentation">
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-board-title"
          >
            <form className={styles.modalForm} onSubmit={handleCreateBoard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalEyebrow}>Create project</p>
                  <h2 id="create-board-title" className={styles.modalTitle}>
                    Name your new project
                  </h2>
                </div>
                <button type="button" className={styles.modalCloseButton} onClick={closeCreateBoardModal}>
                  Close
                </button>
              </div>

              <label className={styles.modalField}>
                <span>Project name</span>
                <input
                  autoFocus
                  className={styles.modalInput}
                  value={newBoardName}
                  onChange={(event) => setNewBoardName(event.target.value)}
                  placeholder="Enter project name"
                />
              </label>

              <div className={styles.modalActions}>
                <button type="button" className={styles.modalSecondaryButton} onClick={closeCreateBoardModal}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={newBoardName.trim().length === 0}>
                  Create project
                </button>
              </div>
            </form>
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

      <div className={styles.motivationWidget}>
        {isMotivationOpen ? (
          <div className={styles.motivationBubble}>
            <p className={styles.motivationLabel}>Random motivation</p>
            <strong className={styles.motivationTitle}>Keep your spirit up</strong>
            <p className={styles.motivationText}>{motivationQuote}</p>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.motivationButton}
          onClick={handleGenerateMotivation}
          aria-label={isMotivationOpen ? 'Hide motivation quote' : 'Show motivation quote'}
          title={isMotivationOpen ? 'Hide motivation' : 'Show motivation'}
        >
          <span className={styles.motivationAvatar} aria-hidden="true">
            <svg viewBox="0 0 96 96" className={styles.motivationAvatarArt}>
              {/* Naruto: headband, spiky blonde hair, blue eyes, orange accent */}
              <circle cx="48" cy="50" r="27" fill="#f5e6c8" />
              <path d="M16 30 L48 20 L80 30 L76 40 L48 36 L20 40 Z" fill="#2c5282" stroke="#1a365d" strokeWidth="1.2" />
              <path d="M24 26 L26 12 L32 22 L40 10 L48 20 L56 10 L64 22 L70 12 L72 26 L66 32 L48 30 L30 32 Z" fill="#f4d03f" stroke="#e5c23a" strokeWidth="0.8" />
              <path d="M30 64c5 6 13 10 18 10s13-4 18-10l5 16H25l5-16Z" fill="#e67e22" />
              <ellipse cx="35" cy="48" rx="4" ry="5" fill="#3498db" />
              <ellipse cx="61" cy="48" rx="4" ry="5" fill="#3498db" />
              <path d="M36 58c3 5 12 5 15 0" stroke="#2c3e50" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M39 58c1.5 4 8 4 9.5 0" stroke="#f5e6c8" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
    </WorkspaceRoleProvider>
  );
}
