'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  loadWorkspaceMembers,
  saveWorkspaceMember,
  removeWorkspaceMember,
} from '@/lib/utils/workspace-members';
import { useWorkspaceRole } from '@/lib/contexts/WorkspaceRoleContext';
import type { WorkspaceMember } from '@/lib/types/workspace';
import type { MemberRole } from '@/lib/types/board';
import styles from './MembersTable.module.css';

const ROLES: { value: MemberRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export function MembersTable() {
  const { canManageMembers } = useWorkspaceRole();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('member');

  const refresh = useCallback(() => {
    setLoading(true);
    loadWorkspaceMembers().then((list) => {
      setMembers(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRoleChange = useCallback(
    (id: string, role: MemberRole) => {
      const m = members.find((x) => x.id === id);
      if (!m || !canManageMembers) return;
      const next = { ...m, role };
      setMembers((prev) => prev.map((x) => (x.id === id ? next : x)));
      void saveWorkspaceMember(next);
    },
    [members, canManageMembers]
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (!canManageMembers) return;
      void removeWorkspaceMember(id).then(() => refresh());
    },
    [canManageMembers, refresh]
  );

  const handleAdd = useCallback(() => {
    const email = newEmail.trim().toLowerCase();
    const name = newName.trim() || email.split('@')[0] || 'Member';
    if (!email || !canManageMembers) return;
    const id = crypto.randomUUID();
    const member: WorkspaceMember = { id, email, name, role: newRole };
    void saveWorkspaceMember(member).then(() => {
      setMembers((prev) => [...prev, member]);
      setNewEmail('');
      setNewName('');
      setNewRole('member');
    });
  }, [newEmail, newName, newRole, canManageMembers]);

  if (loading) {
    return <p className={styles.loading}>Loading members…</p>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thName}>Name</th>
            <th className={styles.thEmail}>Email</th>
            <th className={styles.thRole}>Role</th>
            {canManageMembers && <th className={styles.thActions}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className={styles.tdName}>{m.name}</td>
              <td className={styles.tdEmail}>{m.email}</td>
              <td className={styles.tdRole}>
                {canManageMembers ? (
                  <select
                    className={styles.roleSelect}
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as MemberRole)}
                    aria-label={`Role for ${m.name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.roleBadge}>{m.role}</span>
                )}
              </td>
              {canManageMembers && (
                <td className={styles.tdActions}>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => handleRemove(m.id)}
                    aria-label={`Remove ${m.name}`}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManageMembers && (
        <div className={styles.addForm}>
          <h3 className={styles.addTitle}>Add member</h3>
          <div className={styles.addRow}>
            <input
              type="email"
              className={styles.addInput}
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              aria-label="New member email"
            />
            <input
              type="text"
              className={styles.addInput}
              placeholder="Name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New member name"
            />
            <select
              className={styles.roleSelect}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as MemberRole)}
              aria-label="New member role"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.addBtn}
              onClick={handleAdd}
              disabled={!newEmail.trim()}
            >
              Add
            </button>
          </div>
          <p className={styles.addHint}>
            Member will get this role when they log in with this email. Add yourself as Admin first
            if the list is empty.
          </p>
        </div>
      )}
    </div>
  );
}
