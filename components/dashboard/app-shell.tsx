'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { workspaceTitle } from '@/lib/constants/workspace';
import { defaultBoardId } from '@/lib/mock-data/boards';
import { createBoardFromTemplate, deleteBoard, loadStoredBoards, mergeBoards, saveBoard, BOARD_STORAGE_EVENT } from '@/lib/utils/board-storage';
import { getBoards } from '@/lib/utils/board';
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

  useEffect(() => {
    function syncBoards() {
      setBoards(mergeBoards(staticBoards, loadStoredBoards()));
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

  function handleCreateBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const templateBoard =
      staticBoards.find((board) => board.id === activeBoardId) ??
      staticBoards.find((board) => board.id === defaultBoardId) ??
      staticBoards[0];

    if (!templateBoard) {
      return;
    }

    const nextBoard = createBoardFromTemplate(templateBoard, boards, newBoardName);
    saveBoard(nextBoard);
    setBoards((current) => mergeBoards(current, [nextBoard]));
    closeCreateBoardModal();
    router.push(`/boards/${nextBoard.id}`);
  }

  function handleDeleteBoard(boardId: string) {
    deleteBoard(boardId);
    setBoards((current) => current.filter((board) => board.id !== boardId));

    if (activeBoardId === boardId) {
      router.push('/');
    }
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
          <p className={styles.sectionLabel}>Favorites</p>
          <Link className={styles.navItem} href="/">
            Overview
          </Link>
          {boards
            .filter((board) => board.favorites)
            .map((board) => (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className={`${styles.navItem} ${activeBoardId === board.id ? styles.navItemActive : ''}`}
              >
                <span className={styles.navDot} />
                {board.name}
              </Link>
            ))}
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
                <Link href={`/boards/${board.id}`} className={styles.navItemLink}>
                  <span className={styles.workspacePill}>{board.workspace.slice(0, 1)}</span>
                  <span className={styles.navItemLabel}>{board.name}</span>
                </Link>
                <button
                  type="button"
                  className={styles.deleteIconButton}
                  onClick={() => handleDeleteBoard(board.id)}
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
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className={`${styles.navItem} ${activeBoardId === board.id ? styles.navItemActive : ''}`}
              >
                <span className={styles.workspacePill}>{board.workspace.slice(0, 1)}</span>
                {board.name}
              </Link>
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
            <div className={styles.userBubble}>HN</div>
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
              <circle cx="48" cy="49" r="27" fill="#f1c98e" />
              <path d="M26 38c4-17 40-17 44 0-6 4-16 6-22 6s-16-2-22-6Z" fill="#d8bb6f" />
              <path d="M16 34c0-8 16-16 32-16s32 8 32 16-16 10-32 10S16 42 16 34Z" fill="#b49652" />
              <path d="M18 33c0-10 13-21 30-21s30 11 30 21c0 3-2 6-5 8-4-5-14-8-25-8s-21 3-25 8c-3-2-5-5-5-8Z" fill="#d6b463" />
              <path d="M27 25c6-5 14-8 21-8 8 0 15 2 21 7" stroke="#d83f4c" strokeWidth="4" strokeLinecap="round" />
              <path d="M30 62c5 7 13 11 18 11s13-4 18-11l8 21H22l8-21Z" fill="#cf3d47" />
              <path d="M32 48c0 3 2 5 4 5s4-2 4-5" stroke="#27373d" strokeWidth="3" strokeLinecap="round" />
              <path d="M56 48c0 3 2 5 4 5s4-2 4-5" stroke="#27373d" strokeWidth="3" strokeLinecap="round" />
              <path d="M33 60c5 7 25 7 30 0" stroke="#27373d" strokeWidth="4" strokeLinecap="round" />
              <path d="M36 60c2 8 22 8 24 0" stroke="#fffaf0" strokeWidth="8" strokeLinecap="round" />
              <path d="M62 45c2-4 5-5 8-4" stroke="#27373d" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M61 36c2-3 4-5 8-5" stroke="#27373d" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
