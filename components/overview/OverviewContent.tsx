'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getBoards } from '@/lib/utils/board';
import { loadBoards, mergeBoards, BOARD_STORAGE_EVENT } from '@/lib/utils/board-storage';
import { ListOfProjectsSegment } from '@/components/overview/ListOfProjectsSegment';
import type { Board } from '@/lib/types/board';
import styles from '@/components/board/board-client.module.css';

export function OverviewContent() {
  const staticBoards = useMemo(() => getBoards(), []);
  const [boards, setBoards] = useState<Board[]>(staticBoards);

  useEffect(() => {
    function sync() {
      loadBoards().then((stored) => setBoards(mergeBoards(staticBoards, stored)));
    }
    sync();
    window.addEventListener(BOARD_STORAGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BOARD_STORAGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [staticBoards]);

  return (
    <>
      <section className={styles.overviewHero}>
        <div>
          <p className={styles.heroEyebrow}>Overview</p>
          <h2 className={styles.heroTitle}>Run your weekly execution from one workspace.</h2>
          <p className={styles.heroDescription}>
            A polished planning surface with board views, status tracking, and fast decision-making.
          </p>
        </div>
        <div className={styles.heroStatsGrid}>
          {boards.map((board) => (
            <Link key={board.id} href={`/boards/${board.id}`} className={styles.metricCard}>
              <span className={styles.metricLabel}>{board.workspace}</span>
              <strong className={styles.metricValue}>{board.name}</strong>
              <span className={styles.metricHint}>{board.description}</span>
            </Link>
          ))}
        </div>
      </section>
      <ListOfProjectsSegment boards={boards} />
    </>
  );
}
