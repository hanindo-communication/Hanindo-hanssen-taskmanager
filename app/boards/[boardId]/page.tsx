import { BoardClient } from '@/components/board/board-client';
import { AppShell } from '@/components/dashboard/app-shell';
import { getBoardById } from '@/lib/utils/board';

type BoardPageProps = {
  params: Promise<{
    boardId: string;
  }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;
  const board = getBoardById(boardId);

  return (
    <AppShell activeBoardId={boardId}>
      <BoardClient initialBoard={board ?? null} boardId={boardId} />
    </AppShell>
  );
}
