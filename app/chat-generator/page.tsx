import { AppShell } from '@/components/dashboard/app-shell';
import styles from '@/components/board/board-client.module.css';

export default function ChatGeneratorPage() {
  return (
    <AppShell activeSection="chat-generator">
      <section className={styles.overviewHero}>
        <div>
          <p className={styles.heroEyebrow}>Chat Generator</p>
          <h2 className={styles.heroTitle}>Chat Generator</h2>
          <p className={styles.heroDescription}>Content coming soon.</p>
        </div>
      </section>
    </AppShell>
  );
}
