'use client';

import { createClient } from '@/lib/supabase/client';

export type MemberWithProjects = {
  id: string;
  name: string;
  projects: string[];
};

/** Dispatch this event after saving from Organization modal so List of Projects refetches. */
export const OVERVIEW_MEMBER_PROJECTS_UPDATED = 'task-manager:overview-member-projects-updated';

function isSupabaseConfigured(): boolean {
  return createClient() !== null;
}

export async function fetchOverviewMemberProjects(
  workspace: string
): Promise<MemberWithProjects[] | null> {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) return null;
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('overview_member_projects')
    .select('data')
    .eq('workspace', workspace)
    .maybeSingle();
  if (error || !data?.data) return null;
  const arr = data.data as unknown;
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr as MemberWithProjects[];
}

export async function saveOverviewMemberProjects(
  workspace: string,
  members: MemberWithProjects[]
): Promise<void> {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) return;
  const supabase = createClient();
  if (!supabase) return;
  await supabase.from('overview_member_projects').upsert(
    { workspace, data: members },
    { onConflict: 'workspace' }
  );
}
