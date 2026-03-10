import Link from 'next/link';
import { AppShell } from '@/components/dashboard/app-shell';
import { getBoards } from '@/lib/utils/board';
import { ListOfProjectsSegment } from '@/components/overview/ListOfProjectsSegment';
import styles from '@/components/board/board-client.module.css';

export default function HomePage() {
  const boards = getBoards();

  return (
    <AppShell>
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
    </AppShell>
  );
}
