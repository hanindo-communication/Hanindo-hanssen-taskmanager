'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchOverviewMemberProjects,
  saveOverviewMemberProjects,
  OVERVIEW_MEMBER_PROJECTS_UPDATED,
} from '@/lib/supabase/overview-member-projects';
import type { MemberWithProjects } from '@/lib/supabase/overview-member-projects';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import styles from './OrganizationModal.module.css';

const DEFAULT_ROOT_NAME = 'Hanssen';
const DEFAULT_CHILDREN: { id: string; name: string; projects: string[] }[] = [
  { id: 'org-dinda', name: 'Dinda', projects: ['Diory Wear', 'Meatguy', 'Wedison'] },
  {
    id: 'org-kezia',
    name: 'Kezia',
    projects: ['Veraldo', 'Kasogi Underwear', 'TNC', 'ULI [Tent]', 'Fernanda', 'Sejalan'],
  },
];

const BRAND_ASSISTANT_BULLETS = [
  'Assisting the communication is on the right timing',
  'Daily Update performance',
  'Reminder to BM about Events up coming connected with Brand handled',
  'Call meeting [Tentative] for MoM',
  'Brainstorming new strategy',
] as const;

type OrgChild = { id: string; name: string; projects: string[] };

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  variant: 'danger' | 'default';
  onConfirm: () => void;
};

type OrganizationModalProps = {
  workspace: string;
  onClose: () => void;
};

function membersToChildren(members: MemberWithProjects[]): OrgChild[] {
  return members.map((m) => ({ id: m.id, name: m.name, projects: [...m.projects] }));
}

function childrenToMembers(children: OrgChild[]): MemberWithProjects[] {
  return children.map((c) => ({ id: c.id, name: c.name, projects: [...c.projects] }));
}

export function OrganizationModal({ workspace, onClose }: OrganizationModalProps) {
  const [rootName, setRootName] = useState(DEFAULT_ROOT_NAME);
  const [children, setChildren] = useState<OrgChild[]>(() => [...DEFAULT_CHILDREN.map((c) => ({ ...c, projects: [...c.projects] }))]);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
  });
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(() => {
    fetchOverviewMemberProjects(workspace).then((data) => {
      if (data && data.length > 0) {
        setChildren(membersToChildren(data));
      }
    });
  }, [workspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveOverviewMemberProjects(workspace, childrenToMembers(children));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(OVERVIEW_MEMBER_PROJECTS_UPDATED));
      }
      onClose();
    } catch {
      // keep modal open on error
    } finally {
      setIsSaving(false);
    }
  };

  const updateChild = useCallback((id: string, updater: (c: OrgChild) => OrgChild) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }, []);

  const setChildName = useCallback((id: string, name: string) => {
    updateChild(id, (c) => ({ ...c, name: name.trim() || c.name }));
  }, [updateChild]);

  const setChildProject = useCallback((childId: string, index: number, value: string) => {
    setChildren((prev) =>
      prev.map((c) =>
        c.id === childId
          ? { ...c, projects: c.projects.map((p, i) => (i === index ? value : p)) }
          : c
      )
    );
  }, []);

  const addProject = useCallback((childId: string) => {
    setChildren((prev) =>
      prev.map((c) => (c.id === childId ? { ...c, projects: [...c.projects, 'New project'] } : c))
    );
  }, []);

  const removeProject = useCallback((childId: string, index: number) => {
    const child = children.find((c) => c.id === childId);
    const projectName = child?.projects[index] ?? 'this project';
    setConfirm({
      open: true,
      title: 'Remove project?',
      message: `Remove "${projectName}" from ${child?.name ?? 'member'}'s list?`,
      variant: 'default',
      onConfirm: () => {
        setChildren((prev) =>
          prev.map((c) =>
            c.id === childId ? { ...c, projects: c.projects.filter((_, i) => i !== index) } : c
          )
        );
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }, [children]);

  const addMember = useCallback(() => {
    setChildren((prev) => [
      ...prev,
      { id: `org-${Date.now()}`, name: 'New member', projects: [] },
    ]);
  }, []);

  const removeMember = useCallback((childId: string) => {
    const child = children.find((c) => c.id === childId);
    setConfirm({
      open: true,
      title: 'Remove member?',
      message: `Remove "${child?.name ?? 'this member'}" from the organization? Their projects will no longer be shown.`,
      variant: 'danger',
      onConfirm: () => {
        setChildren((prev) => prev.filter((c) => c.id !== childId));
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  }, [children]);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-title"
      >
        <div className={styles.header}>
          <h2 id="organization-title" className={styles.title}>
            Organization
          </h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={isSaving}
              aria-label="Save and sync to List of Projects"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>

        <div className={styles.chart}>
          <label className={styles.rootLabel}>
            <span className={styles.visuallyHidden}>Root / top level name</span>
            <input
              type="text"
              className={styles.rootInput}
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              aria-label="Root name"
            />
          </label>
          <div className={styles.connector} aria-hidden="true" />
          <div className={styles.childrenRow}>
            {children.map((person) => (
              <div key={person.id} className={styles.personColumn}>
                <div className={styles.personHeader}>
                  <input
                    type="text"
                    className={styles.personInput}
                    value={person.name}
                    onChange={(e) => setChildName(person.id, e.target.value)}
                    aria-label={`Member name: ${person.name}`}
                  />
                  <button
                    type="button"
                    className={styles.removeMemberButton}
                    onClick={() => removeMember(person.id)}
                    aria-label={`Remove ${person.name}`}
                    title="Remove member"
                  >
                    Remove
                  </button>
                </div>
                <div className={styles.brandsList}>
                  {person.projects.map((project, idx) => (
                    <div key={`${person.id}-${idx}`} className={styles.brandRow}>
                      <input
                        type="text"
                        className={styles.brandInput}
                        value={project}
                        onChange={(e) => setChildProject(person.id, idx, e.target.value)}
                        aria-label={`Project ${idx + 1}`}
                      />
                      <button
                        type="button"
                        className={styles.removeProjectButton}
                        onClick={() => removeProject(person.id, idx)}
                        aria-label="Remove project"
                      >
                        −
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.addProjectButton}
                    onClick={() => addProject(person.id)}
                  >
                    + Add project
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className={styles.addMemberButton} onClick={addMember}>
            + Add member
          </button>
        </div>

        <div className={styles.jobSection}>
          <h3 className={styles.jobTitle}>Brand Assistant</h3>
          <p className={styles.jobNote}>Job description (Dinda & Kezia)</p>
          <ul className={styles.jobList}>
            {BRAND_ASSISTANT_BULLETS.map((item, i) => (
              <li key={i} className={styles.jobItem}>
                {item}
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
    </div>
  );
}
