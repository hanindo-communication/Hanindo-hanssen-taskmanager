'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './login.module.css';

const WELCOME_STORAGE_KEY = 'task-manager.welcomeName';

const EMAIL_TO_NAME: Record<string, string> = {
  'hanssen@hanindo.co.id': 'Hanssen',
  'dinda@hanindo.co.id': 'Dinda',
  'handi@hanindo.co.id': 'Handi',
  'kezia@hanindo.co.id': 'Kezia',
  'vira@hanindo.co.id': 'Vira',
};

function getDisplayName(email: string): string {
  const key = email.trim().toLowerCase();
  const beforeAt = key.split('@')[0] ?? '';
  const fallback = beforeAt ? beforeAt.charAt(0).toUpperCase() + beforeAt.slice(1).toLowerCase() : 'there';
  return (EMAIL_TO_NAME[key] ?? fallback) || 'there';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
      setLoading(false);
      return;
    }
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    if (data.session) {
      sessionStorage.setItem(WELCOME_STORAGE_KEY, getDisplayName(email.trim()));
      window.location.href = '/welcome';
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>TM</span>
          <h1 className={styles.title}>Task Manager</h1>
          <p className={styles.subtitle}>Sign in with your workspace email</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

          <label className={styles.label}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@hanindo.co.id"
              required
            />
          </label>

          <label className={styles.label}>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />
          </label>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
