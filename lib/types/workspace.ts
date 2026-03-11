import type { MemberRole } from './board';

export type WorkspaceMember = {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
};
