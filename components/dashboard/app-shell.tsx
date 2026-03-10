'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import styles from './app-shell.module.css';

type AppShellProps = {
  children: React.ReactNode;
  activeBoardId?: string;
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

export function AppShell({ children, activeBoardId }: AppShellProps) {
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
    function syncBoards() {
      loadBoards().then((stored) => setBoards(mergeBoards(staticBoards, stored)));
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

    const templateBoard =
      staticBoards.find((board) => board.id === activeBoardId) ??
      staticBoards.find((board) => board.id === defaultBoardId) ??
      staticBoards[0];

    if (!templateBoard) {
      return;
    }

    const nextBoard = await createBoardFromTemplateAsync(templateBoard, boards, newBoardName);
    setBoards((current) => mergeBoards(current, [nextBoard]));
    closeCreateBoardModal();
    router.push(`/boards/${nextBoard.id}`);
  }

  async function handleDeleteBoard(boardId: string) {
    await deleteBoardAsync(boardId);
    setBoards((current) => current.filter((board) => board.id !== boardId));

    if (activeBoardId === boardId) {
      router.push('/');
    }
  }

  async function handleRemoveFromFavorites(boardId: string) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return;
    setOpenDropdownBoardId((id) => (id === boardId ? null : id));
    await saveBoardAsync({ ...board, favorites: false });
    setBoards((current) =>
      current.map((b) => (b.id === boardId ? { ...b, favorites: false } : b))
    );
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
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandIcon}>TM</div>
          <div>
            <p className={styles.brandEyebrow}>Workspace</p>
            <h1 className={styles.brandTitle}>{workspaceTitle}</h1>
          </div>
        </div>

        <div className={styles.sidebarSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Favorites</p>
            <button
              type="button"
              className={styles.sectionActionButton}
              onClick={() => setIsFavoritesEditMode((current) => !current)}
            >
              {isFavoritesEditMode ? 'Done' : 'Edit'}
            </button>
          </div>
          <Link className={styles.navItem} href="/">
            Overview
          </Link>
          {boards
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
                      void handleRemoveFromFavorites(board.id);
                    }}
                    aria-label={`Remove ${board.name} from Favorites`}
                    title="Remove from Favorites"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={styles.deleteIconButton}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDeleteBoard(board.id);
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
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Programs/Projects</p>
            <button
              type="button"
              className={styles.sectionActionButton}
              onClick={() => setIsProjectEditMode((current) => !current)}
            >
              {isProjectEditMode ? 'Done' : 'Edit'}
            </button>
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
                <button
                  type="button"
                  className={styles.deleteIconButton}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleDeleteBoard(board.id);
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
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.teamCard}>
            <p className={styles.teamLabel}>This week</p>
            <strong>12 updates synced</strong>
            <span>All boards running from local demo data.</span>
          </div>
        </div>
      </aside>

      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.topbarLabel}>Collaborative workspace</p>
            <strong className={styles.topbarTitle}>Manage projects with clarity</strong>
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
            <button className={styles.primaryButton} type="button" onClick={openCreateBoardModal}>
              New project
            </button>
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
  );
}
