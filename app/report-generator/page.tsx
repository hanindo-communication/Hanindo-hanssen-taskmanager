import { AppShell } from '@/components/dashboard/app-shell';
import styles from '@/components/board/board-client.module.css';

export default function ReportGeneratorPage() {
  return (
    <AppShell activeSection="report-generator">
      <section className={styles.overviewHero}>
        <div>
          <p className={styles.heroEyebrow}>Report Generator</p>
          <h2 className={styles.heroTitle}>Report Generator</h2>
          <p className={styles.heroDescription}>Content coming soon.</p>
        </div>
      </section>
    </AppShell>
  );
}
