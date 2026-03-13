'use client';

import { useEffect, useState, useMemo } from 'react';
import { getBoards } from '@/lib/utils/board';
import { loadBoards, mergeBoards, BOARD_STORAGE_EVENT } from '@/lib/utils/board-storage';
import { ListOfProjectsSegment } from '@/components/overview/ListOfProjectsSegment';
import { PendingTasksSegment } from '@/components/overview/PendingTasksSegment';
import { ContextualHint } from '@/components/overview/ContextualHint';
import type { Board } from '@/lib/types/board';

export function OverviewContent() {
  const staticBoards = useMemo(() => getBoards(), []);
  const [boards, setBoards] = useState<Board[]>(staticBoards);

  useEffect(() => {
    function sync() {
      loadBoards().then((stored) => setBoards(mergeBoards(staticBoards, stored)));
    }
    sync();
    window.addEventListener(BOARD_STORAGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BOARD_STORAGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [staticBoards]);

  return (
    <>
      <PendingTasksSegment boards={boards} />
      <ContextualHint boards={boards} />
      <ListOfProjectsSegment boards={boards} />
    </>
  );
}
