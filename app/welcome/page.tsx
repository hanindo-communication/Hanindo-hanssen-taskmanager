'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './welcome.module.css';

const WELCOME_STORAGE_KEY = 'task-manager.welcomeName';

const EMAIL_TO_NAME: Record<string, string> = {
  'hanssen@hanindo.co.id': 'Hanssen',
  'dinda@hanindo.co.id': 'Dinda',
  'handi@hanindo.co.id': 'Handi',
  'kezia@hanindo.co.id': 'Kezia',
  'vira@hanindo.co.id': 'Vira',
};

function getDisplayName(email: string | undefined): string {
  if (!email) return 'there';
  const key = email.trim().toLowerCase();
  const beforeAt = key.split('@')[0] ?? '';
  const fallback = beforeAt ? beforeAt.charAt(0).toUpperCase() + beforeAt.slice(1).toLowerCase() : 'there';
  return (EMAIL_TO_NAME[key] ?? fallback) || 'there';
}

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(WELCOME_STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(WELCOME_STORAGE_KEY);
      setName(stored);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      router.replace('/login');
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.email) {
        router.replace('/login');
        return;
      }
      setName(getDisplayName(session.user.email));
    });
  }, [router]);

  useEffect(() => {
    if (name === null) return;
    const t = setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 2500);
    return () => clearTimeout(t);
  }, [name, router]);

  if (name === null) {
    return (
      <div className={styles.wrap}>
        <p className={styles.text}>Loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.banner}>
        <h1 className={styles.title}>Welcome, {name}</h1>
        <p className={styles.sub}>Taking you to your workspace…</p>
      </div>
    </div>
  );
}
