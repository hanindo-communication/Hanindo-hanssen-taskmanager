-- Task Manager – Supabase schema
-- Jalankan di Supabase Dashboard → SQL Editor (New query) → Run

-- Enum types (sesuai lib/types/board.ts)
create type task_status as enum (
  'workingOnIt',
  'done',
  'stuck',
  'review',
  'planned'
);

create type task_priority as enum (
  'critical',
  'high',
  'medium',
  'low'
);

-- Tabel: boards (project/board)
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  workspace text not null default 'Workspace',
  favorites boolean not null default false,
  completion_rate int not null default 0 check (completion_rate >= 0 and completion_rate <= 100),
  due_this_week int not null default 0 check (due_this_week >= 0),
  active_automations int not null default 0 check (active_automations >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabel: board_members (anggota per board)
create table public.board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  initials text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  unique (board_id, name)
);

create index idx_board_members_board_id on public.board_members(board_id);

-- Tabel: task_groups (kolom/group tugas, e.g. "List of Tasks", "Kickoff")
create table public.task_groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  color text not null default '#0fa958',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_task_groups_board_id on public.task_groups(board_id);

-- Tabel: tasks (item tugas)
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.task_groups(id) on delete cascade,
  name text not null,
  status task_status not null default 'planned',
  assignee_id uuid references public.board_members(id) on delete set null,
  due_date date,
  priority task_priority not null default 'medium',
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_group_id on public.tasks(group_id);
create index idx_tasks_assignee_id on public.tasks(assignee_id);
create index idx_tasks_due_date on public.tasks(due_date);

-- Trigger: updated_at otomatis
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger boards_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Row Level Security (RLS) – aktifkan; kebijakan bisa dikustom nanti
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.task_groups enable row level security;
alter table public.tasks enable row level security;

-- Policy sementara: izinkan semua untuk anon/authenticated (untuk development)
-- Ganti nanti dengan policy per user_id kalau pakai auth
create policy "Allow all on boards" on public.boards
  for all using (true) with check (true);

create policy "Allow all on board_members" on public.board_members
  for all using (true) with check (true);

create policy "Allow all on task_groups" on public.task_groups
  for all using (true) with check (true);

create policy "Allow all on tasks" on public.tasks
  for all using (true) with check (true);
