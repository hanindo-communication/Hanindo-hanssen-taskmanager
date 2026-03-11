'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MemberRole } from '@/lib/types/board';

type WorkspaceRoleContextValue = {
  role: MemberRole | null;
  isAdmin: boolean;
  canEdit: boolean;
  canDeleteBoard: boolean;
  canManageMembers: boolean;
};

const WorkspaceRoleContext = createContext<WorkspaceRoleContextValue>({
  role: null,
  isAdmin: false,
  canEdit: false,
  canDeleteBoard: false,
  canManageMembers: false,
});

export function useWorkspaceRole(): WorkspaceRoleContextValue {
  return useContext(WorkspaceRoleContext);
}

export function WorkspaceRoleProvider({
  role,
  children,
}: {
  role: MemberRole | null;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const isAdmin = role === 'admin';
    const canEdit = role === 'admin' || role === 'member';
    const canDeleteBoard = role === 'admin';
    const canManageMembers = role === 'admin';
    return {
      role,
      isAdmin,
      canEdit,
      canDeleteBoard,
      canManageMembers,
    };
  }, [role]);

  return (
    <WorkspaceRoleContext.Provider value={value}>
      {children}
    </WorkspaceRoleContext.Provider>
  );
}
