import { Button } from '../components';

export function HomePage() {
  return (
    <section>
      <h2>Welcome</h2>
      <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
        Task Manager — Electron + React + Vite + TypeScript
      </p>
      <Button variant="primary" style={{ marginTop: '1rem' }}>
        Get Started
      </Button>
    </section>
  );
}
