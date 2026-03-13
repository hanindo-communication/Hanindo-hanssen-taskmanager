'use client';

import type { Board } from '@/lib/types/board';

type ContextualHintProps = {
  boards: Board[];
  activeBoardId?: string;
};

/** Contextual hint hidden per request; component kept for API compatibility. */
export function ContextualHint(_props: ContextualHintProps) {
  return null;
}
