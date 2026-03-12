-- Allow string IDs (e.g. product-launch, task-1) so default/mock boards can be saved to Supabase.
-- Run this in Supabase SQL Editor if your schema still uses uuid for these columns.

-- Drop FKs that reference uuid columns
alter table public.board_members drop constraint if exists board_members_board_id_fkey;
alter table public.task_groups drop constraint if exists task_groups_board_id_fkey;
alter table public.tasks drop constraint if exists tasks_group_id_fkey;
alter table public.tasks drop constraint if exists tasks_assignee_id_fkey;

-- Change PK/FK columns to text
alter table public.boards alter column id type text using id::text;
alter table public.board_members alter column id type text using id::text;
alter table public.board_members alter column board_id type text using board_id::text;
alter table public.task_groups alter column id type text using id::text;
alter table public.task_groups alter column board_id type text using board_id::text;
alter table public.tasks alter column id type text using id::text;
alter table public.tasks alter column group_id type text using group_id::text;
alter table public.tasks alter column assignee_id type text using assignee_id::text;

-- Remove default gen_random_uuid() so we can insert custom ids (optional; keeps inserts flexible)
alter table public.boards alter column id drop default;
alter table public.board_members alter column id drop default;
alter table public.task_groups alter column id drop default;
alter table public.tasks alter column id drop default;

-- Re-add foreign keys
alter table public.board_members
  add constraint board_members_board_id_fkey
  foreign key (board_id) references public.boards(id) on delete cascade;
alter table public.task_groups
  add constraint task_groups_board_id_fkey
  foreign key (board_id) references public.boards(id) on delete cascade;
alter table public.tasks
  add constraint tasks_group_id_fkey
  foreign key (group_id) references public.task_groups(id) on delete cascade;
alter table public.tasks
  add constraint tasks_assignee_id_fkey
  foreign key (assignee_id) references public.board_members(id) on delete set null;
