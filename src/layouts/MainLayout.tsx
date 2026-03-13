import { Outlet, Link } from 'react-router-dom';
import styles from './MainLayout.module.css';

export function MainLayout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          Task Manager
        </Link>
        <nav className={styles.nav}>
          <Link to="/">Home</Link>
          <Link to="/tasks">Tasks</Link>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
