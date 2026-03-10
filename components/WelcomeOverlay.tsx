'use client';

import { useEffect, useState } from 'react';
import styles from './WelcomeOverlay.module.css';

const STORAGE_KEY = 'task-manager.welcomeName';

export function WelcomeOverlay() {
  const [name, setName] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setName(stored);
      setVisible(true);
      sessionStorage.removeItem(STORAGE_KEY);
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible || !name) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.card}>
        <span className={styles.title}>Welcome, {name}</span>
        <button
          type="button"
          className={styles.close}
          onClick={() => setVisible(false)}
          aria-label="Close welcome banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
