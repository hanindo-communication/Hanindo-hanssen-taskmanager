'use client';

import { createClient } from '@/lib/supabase/client';
import type { MemberRole } from '@/lib/types/board';
import type { WorkspaceMember } from '@/lib/types/workspace';

const STORAGE_KEY = 'task-manager.workspace-members';
export const WORKSPACE_MEMBERS_EVENT = 'task-manager:workspace-members-updated';

function dispatchMembersUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WORKSPACE_MEMBERS_EVENT));
  }
}

export function loadWorkspaceMembersFromStorage(): WorkspaceMember[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceMember[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkspaceMembersToStorage(members: WorkspaceMember[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

export async function loadWorkspaceMembers(): Promise<WorkspaceMember[]> {
  if (typeof window === 'undefined') return [];
  const supabase = createClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('workspace_members').select('id, email, name, role');
      if (!error && data && Array.isArray(data)) {
        return (data as WorkspaceMember[]).map((m) => ({
          id: m.id,
          email: m.email ?? '',
          name: m.name ?? '',
          role: (m.role as MemberRole) || 'member',
        }));
      }
    } catch {
      // fallback to localStorage
    }
  }
  return loadWorkspaceMembersFromStorage();
}

export async function saveWorkspaceMember(member: WorkspaceMember): Promise<void> {
  const supabase = createClient();
  if (supabase) {
    try {
      await supabase.from('workspace_members').upsert(
        {
          id: member.id,
          email: member.email,
          name: member.name,
          role: member.role,
        },
        { onConflict: 'email' }
      );
      dispatchMembersUpdated();
      return;
    } catch {
      // fallback
    }
  }
  const list = loadWorkspaceMembersFromStorage();
  const idx = list.findIndex((m) => m.id === member.id || m.email === member.email);
  const next = idx >= 0 ? list.map((m, i) => (i === idx ? member : m)) : [...list, member];
  saveWorkspaceMembersToStorage(next);
  dispatchMembersUpdated();
}

export async function removeWorkspaceMember(id: string): Promise<void> {
  const supabase = createClient();
  if (supabase) {
    try {
      await supabase.from('workspace_members').delete().eq('id', id);
      dispatchMembersUpdated();
      return;
    } catch {
      // fallback
    }
  }
  const list = loadWorkspaceMembersFromStorage().filter((m) => m.id !== id);
  saveWorkspaceMembersToStorage(list);
  dispatchMembersUpdated();
}

export function getRoleForEmail(members: WorkspaceMember[], email: string | undefined): MemberRole | null {
  if (!email) return null;
  const m = members.find((x) => x.email.toLowerCase() === email.toLowerCase());
  return m ? m.role : null;
}
