import { AppShell } from '@/components/dashboard/app-shell';
import { MemberBmBaPanel } from '@/components/settings/MemberBmBaPanel';
import styles from './settings.module.css';

export default function SettingsPage() {
  return (
    <AppShell activeSection="settings">
      <div className={styles.settingsPage}>
        <header className={styles.settingsHeader}>
          <p className={styles.settingsEyebrow}>Settings</p>
          <h1 className={styles.settingsTitle}>Workspace settings</h1>
          <p className={styles.settingsDescription}>
            Manage roles, members, and how your team uses this workspace.
          </p>
        </header>

        <nav className={styles.settingsNav} aria-label="Settings menu">
          <a href="#role-per-member" className={styles.settingsNavLink}>
            Role per member
          </a>
        </nav>

        <section id="role-per-member" className={styles.settingsSection}>
          <h2 className={styles.sectionTitle}>Role per member</h2>
          <p className={styles.sectionDescription}>
            BM and BA profiles sync to Supabase when configured (same data on localhost and Vercel); this browser also keeps a local cache.
            Only workspace admins can edit these fields.
          </p>

          <MemberBmBaPanel />

          <p className={styles.sectionDescription} style={{ marginTop: '20px' }}>
            Permissions by role:
          </p>
          <div className={styles.roleCards}>
            <article className={styles.roleCard}>
              <div className={styles.roleCardHeader}>
                <span className={`${styles.roleBadge} ${styles.roleBadgeAdmin}`}>Admin</span>
                <h3 className={styles.roleName}>Full access</h3>
              </div>
              <ul className={styles.rolePerms}>
                <li>Hapus board</li>
                <li>Ubah settings workspace</li>
                <li>Invite dan remove member</li>
                <li>Set role orang lain</li>
                <li>Edit task, assign, ubah board (tambah/rename group, dll)</li>
              </ul>
            </article>

            <article className={styles.roleCard}>
              <div className={styles.roleCardHeader}>
                <span className={`${styles.roleBadge} ${styles.roleBadgeMember}`}>Member</span>
                <h3 className={styles.roleName}>Edit &amp; assign</h3>
              </div>
              <ul className={styles.rolePerms}>
                <li>Edit task, assign, ubah board (tambah/rename group, dll)</li>
                <li>Tidak bisa hapus board</li>
                <li>Tidak bisa ubah member/role</li>
              </ul>
            </article>

            <article className={styles.roleCard}>
              <div className={styles.roleCardHeader}>
                <span className={`${styles.roleBadge} ${styles.roleBadgeViewer}`}>Viewer</span>
                <h3 className={styles.roleName}>Read-only</h3>
              </div>
              <ul className={styles.rolePerms}>
                <li>Cuma lihat (read-only)</li>
                <li>Tidak bisa edit task/board</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
