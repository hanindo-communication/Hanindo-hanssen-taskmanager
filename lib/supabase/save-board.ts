import type { SupabaseClient } from '@supabase/supabase-js';
import type { Board } from '@/lib/types/board';

/**
 * Saves a board to Supabase. Can be used from client (with createClient) or server (e.g. API route with createServerClient).
 */
export async function saveBoardWithClient(supabase: SupabaseClient, board: Board): Promise<void> {
  const { error: boardError } = await supabase
    .from('boards')
    .upsert(
      {
        id: board.id,
        name: board.name,
        description: board.description,
        workspace: board.workspace,
        favorites: board.favorites,
        completion_rate: board.stats.completionRate,
        due_this_week: board.stats.dueThisWeek,
        active_automations: board.stats.activeAutomations,
        history_logs: board.historyLogs ?? [],
      },
      { onConflict: 'id' }
    );

  if (boardError) throw boardError;

  await supabase.from('board_members').delete().eq('board_id', board.id);
  if (board.members.length > 0) {
    const { error: membersError } = await supabase.from('board_members').insert(
      board.members.map((m) => ({
        id: m.id,
        board_id: board.id,
        name: m.name,
        initials: m.initials,
        color: m.color,
      }))
    );
    if (membersError) throw membersError;
  }

  const existingGroups = await supabase.from('task_groups').select('id').eq('board_id', board.id);
  const existingIds = (existingGroups.data ?? []).map((r: { id: string }) => r.id);
  if (existingIds.length > 0) {
    await supabase.from('tasks').delete().in('group_id', existingIds);
    await supabase.from('task_groups').delete().eq('board_id', board.id);
  }

  for (let i = 0; i < board.groups.length; i++) {
    const g = board.groups[i];
    const { error: groupError } = await supabase.from('task_groups').insert({
      id: g.id,
      board_id: board.id,
      name: g.name,
      color: g.color,
      sort_order: i,
    });
    if (groupError) throw groupError;

    for (let j = 0; j < g.tasks.length; j++) {
      const t = g.tasks[j];
      const assigneeId =
        t.assigneeId && board.members.some((m) => m.id === t.assigneeId) ? t.assigneeId : null;
      const { error: taskError } = await supabase.from('tasks').insert({
        id: t.id,
        group_id: g.id,
        name: t.name,
        status: t.status,
        assignee_id: assigneeId,
        due_date: t.dueDate || null,
        priority: t.priority,
        progress: t.progress,
        notes: t.notes,
        sort_order: j,
      });
      if (taskError) throw taskError;
    }
  }
}
