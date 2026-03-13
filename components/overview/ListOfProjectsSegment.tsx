'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Board } from '@/lib/types/board';
import { workspaceTitle } from '@/lib/constants/workspace';
import {
  fetchOverviewMemberProjects,
  saveOverviewMemberProjects,
  OVERVIEW_MEMBER_PROJECTS_UPDATED,
} from '@/lib/supabase/overview-member-projects';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import styles from './ListOfProjectsSegment.module.css';

const SUPABASE_SAVE_DEBOUNCE_MS = 600;

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  variant: 'danger' | 'default';
  onConfirm: () => void;
};

const STORAGE_KEY = 'task-manager-list-of-projects';

export type MemberWithProjects = {
  id: string;
  name: string;
  projects: string[];
};

function getDefaultMembers(boards: Board[]): MemberWithProjects[] {
  const memberIds = new Set<string>();
  const memberProjects = new Map<string, Set<string>>();
  const memberByName = new Map<string, { name: string }>();
  boards.forEach((board) => {
    board.members.forEach((m) => {
      memberIds.add(m.id);
      if (!memberByName.has(m.id)) memberByName.set(m.id, { name: m.name });
      if (!memberProjects.has(m.id)) memberProjects.set(m.id, new Set());
      memberProjects.get(m.id)!.add(board.name);
    });
  });
  return Array.from(memberIds).map((id) => {
    const { name } = memberByName.get(id) ?? { name: id };
    return {
      id,
      name,
      projects: Array.from(memberProjects.get(id) ?? []),
    };
  });
}

function loadFromStorage(boards: Board[]): MemberWithProjects[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MemberWithProjects[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveToStorage(members: MemberWithProjects[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  } catch {
    /* ignore */
  }
}

/* Blue palette for pie (solid for gradient end & legend) */
const PIE_BLUE_PALETTE = [
  '#1e3a5a',
  '#2c5282',
  '#2b6cb0',
  '#3182ce',
  '#4299e1',
  '#63b3ed',
  '#90cdf4',
  '#bee3f8',
];

function getPieSegmentColor(_memberId: string, _boards: Board[], index: number): string {
  return PIE_BLUE_PALETTE[index % PIE_BLUE_PALETTE.length];
}

type ListOfProjectsSegmentProps = {
  boards: Board[];
};

export function ListOfProjectsSegment({ boards }: ListOfProjectsSegmentProps) {
  const [members, setMembers] = useState<MemberWithProjects[]>(() =>
    loadFromStorage(boards) ?? getDefaultMembers(boards)
  );
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
  });
  const saveToSupabaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const membersRef = useRef(members);
  membersRef.current = members;

  const refetchMembers = useCallback(() => {
    fetchOverviewMemberProjects(workspaceTitle).then((data) => {
      if (data !== null) setMembers(data);
    });
  }, []);

  // Load from Supabase on mount; fallback stays as initial state (localStorage or default)
  useEffect(() => {
    refetchMembers();
  }, [refetchMembers]);

  // When Organization modal saves, refetch so List of Projects and pie chart stay in sync
  useEffect(() => {
    window.addEventListener(OVERVIEW_MEMBER_PROJECTS_UPDATED, refetchMembers);
    return () => window.removeEventListener(OVERVIEW_MEMBER_PROJECTS_UPDATED, refetchMembers);
  }, [refetchMembers]);

  // When user clicks topbar "Save" button, persist current members & projects to Supabase
  useEffect(() => {
    const handler = () => {
      saveOverviewMemberProjects(workspaceTitle, membersRef.current).catch(() => {});
    };
    window.addEventListener('task-manager:save-request', handler);
    return () => window.removeEventListener('task-manager:save-request', handler);
  }, []);

  useEffect(() => {
    saveToStorage(members);
    if (saveToSupabaseTimeoutRef.current) clearTimeout(saveToSupabaseTimeoutRef.current);
    saveToSupabaseTimeoutRef.current = setTimeout(() => {
      saveOverviewMemberProjects(workspaceTitle, members).catch(() => {});
      saveToSupabaseTimeoutRef.current = null;
    }, SUPABASE_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveToSupabaseTimeoutRef.current) clearTimeout(saveToSupabaseTimeoutRef.current);
    };
  }, [members]);

  const updateMember = useCallback((memberId: string, updater: (m: MemberWithProjects) => MemberWithProjects) => {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? updater(m) : m)));
  }, []);

  const setMemberName = useCallback((memberId: string, name: string) => {
    updateMember(memberId, (m) => ({ ...m, name: name.trim() || m.name }));
  }, [updateMember]);

  const addProject = useCallback((memberId: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, projects: [...m.projects, 'New project'] } : m
      )
    );
  }, []);

  const removeProject = useCallback((memberId: string, index: number) => {
    const member = members.find((m) => m.id === memberId);
    const projectName = member?.projects[index] ?? 'this project';
    setConfirm({
      open: true,
      title: 'Remove project?',
      message: `Remove "${projectName}" from ${member?.name ?? 'member'}'s list?`,
      variant: 'default',
      onConfirm: () => {
        const next = members.map((m) =>
          m.id === memberId
            ? { ...m, projects: m.projects.filter((_, i) => i !== index) }
            : m
        );
        setMembers(next);
        saveOverviewMemberProjects(workspaceTitle, next).catch(() => {});
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }, [members]);

  const updateProjectName = useCallback((memberId: string, index: number, name: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, projects: m.projects.map((p, i) => (i === index ? name : p)) }
          : m
      )
    );
  }, []);

  const addMember = useCallback(() => {
    const id = `member-${Date.now()}`;
    setMembers((prev) => [...prev, { id, name: 'New member', projects: [] }]);
    setOpenMemberId(id);
  }, []);

  const removeMember = useCallback((memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    setConfirm({
      open: true,
      title: 'Remove member?',
      message: `Remove "${member?.name ?? 'this member'}" from the list? Their projects will no longer be shown.`,
      variant: 'danger',
      onConfirm: () => {
        const next = members.filter((m) => m.id !== memberId);
        setMembers(next);
        saveOverviewMemberProjects(workspaceTitle, next).catch(() => {});
        if (openMemberId === memberId) setOpenMemberId(null);
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }, [members, openMemberId]);

  // Pie chart: distribution by member (segment size = number of projects they handle)
  const pieData = members
    .filter((m) => m.projects.length > 0)
    .map((m, i) => ({
      name: m.name,
      count: m.projects.length,
      color: getPieSegmentColor(m.id, boards, i),
    }));
  const total = pieData.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <section className={styles.segment} aria-labelledby="list-of-projects-title">
      <h2 id="list-of-projects-title" className={styles.title}>
        List of Projects
      </h2>
      <div className={styles.grid}>
        <div className={styles.pieColumn}>
          <div className={styles.pieWrap}>
            {pieData.length > 0 ? (
              <svg viewBox="0 0 100 100" className={styles.pieSvg}>
                {pieData.reduce(
                  (acc, d) => {
                    const ratio = d.count / total;
                    const angle = acc.offset * 360;
                    const size = ratio * 360;
                    const x1 = 50 + 45 * Math.cos((angle * Math.PI) / 180);
                    const y1 = 50 + 45 * Math.sin((angle * Math.PI) / 180);
                    const x2 = 50 + 45 * Math.cos(((angle + size) * Math.PI) / 180);
                    const y2 = 50 + 45 * Math.sin(((angle + size) * Math.PI) / 180);
                    const large = size > 180 ? 1 : 0;
                    acc.segments.push(
                      <path
                        key={d.name}
                        d={`M 50 50 L ${x1} ${y1} A 45 45 0 ${large} 1 ${x2} ${y2} Z`}
                        fill={d.color}
                        className={styles.pieSegment}
                      />
                    );
                    acc.offset += ratio;
                    return acc;
                  },
                  { offset: 0, segments: [] as React.ReactNode[] }
                ).segments}
              </svg>
            ) : (
              <div className={styles.pieEmpty}>No projects assigned</div>
            )}
          </div>
          <ul className={styles.legend}>
            {pieData.map((d) => (
              <li key={d.name} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: d.color }} />
                <span>{d.name}: {d.count} project{d.count !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.membersColumn}>
          <div className={styles.membersHeader}>
            <span className={styles.membersLabel}>Members & projects</span>
            <button type="button" className={styles.addMemberButton} onClick={addMember}>
              + Add member
            </button>
          </div>
          <ul className={styles.memberList}>
            {members.map((member) => (
              <li key={member.id} className={styles.memberItem}>
                <button
                  type="button"
                  className={styles.memberTrigger}
                  onClick={() => setOpenMemberId((id) => (id === member.id ? null : member.id))}
                  aria-expanded={openMemberId === member.id}
                >
                  <span className={styles.memberName}>{member.name}</span>
                  <span className={styles.memberCaret}>{openMemberId === member.id ? '▲' : '▼'}</span>
                </button>
                {openMemberId === member.id && (
                  <div className={styles.memberDropdown}>
                    <div className={styles.memberNameEdit}>
                      <label className={styles.memberNameLabel}>Name</label>
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) => setMemberName(member.id, e.target.value)}
                        className={styles.memberNameInput}
                        placeholder="Member name"
                      />
                    </div>
                    <div className={styles.projectsBlock}>
                      <span className={styles.projectsLabel}>Projects they handle</span>
                      <ul className={styles.projectsList}>
                        {member.projects.map((project, idx) => (
                          <li key={idx} className={styles.projectRow}>
                            <input
                              type="text"
                              value={project}
                              onChange={(e) => updateProjectName(member.id, idx, e.target.value)}
                              className={styles.projectInput}
                              placeholder="Project name"
                            />
                            <button
                              type="button"
                              className={styles.removeProjectButton}
                              onClick={() => removeProject(member.id, idx)}
                              aria-label="Remove project"
                            >
                              −
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className={styles.addProjectButton}
                        onClick={() => addProject(member.id)}
                      >
                        + Add project
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.removeMemberButton}
                      onClick={() => removeMember(member.id)}
                    >
                      Remove member
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
    </section>
  );
}
