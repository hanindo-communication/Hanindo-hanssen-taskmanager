import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveBoardWithClient } from '@/lib/supabase/save-board';
import type { Board } from '@/lib/types/board';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await context.params;

  let board: Board;
  try {
    const body = await request.json();
    if (!body || typeof body.id !== 'string' || body.id !== boardId) {
      return NextResponse.json(
        { error: 'Invalid board or boardId mismatch' },
        { status: 400 }
      );
    }
    board = body as Board;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    await saveBoardWithClient(supabase, board);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Board save failed:', e);
    return NextResponse.json(
      { error: 'Failed to save board' },
      { status: 500 }
    );
  }
}
