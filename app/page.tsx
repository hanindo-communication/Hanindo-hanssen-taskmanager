import { AppShell } from '@/components/dashboard/app-shell';
import { OverviewContent } from '@/components/overview/OverviewContent';

export default function HomePage() {
  return (
    <AppShell activeSection="overview">
      <OverviewContent />
    </AppShell>
  );
}
