import Link from 'next/link';
import { AppShell } from '@/components/dashboard/app-shell';
import styles from '@/components/board/board-client.module.css';

export default function NotFound() {
  return (
    <AppShell>
      <section className={styles.emptyState}>
        <p className={styles.heroEyebrow}>Board not found</p>
        <h2 className={styles.heroTitle}>The board you requested is not available.</h2>
        <Link className={styles.primaryCta} href="/">
          Return to overview
        </Link>
      </section>
    </AppShell>
  );
}
