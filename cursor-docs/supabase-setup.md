# Supabase Setup – Task Manager

Panduan singkat membuat tabel di Supabase, login (Auth), dan menyambungkan app.

---

## Langkah yang harus kamu lakukan sekarang (sekali saja)

1. **Buka Supabase Dashboard**  
   https://supabase.com/dashboard → pilih project kamu (yang connect ke MCP).

2. **Ambil API keys**  
   Di sidebar: **Project Settings** (ikon gerigi) → **API**.  
   Di sana ada:
   - **Project URL** — sudah terisi di `.env.local` (repo ini).
   - **anon public** — klik Reveal / Copy, lalu paste ke `.env.local` di baris `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`.
   - **service_role** — klik Reveal / Copy, lalu paste ke `.env.local` di baris `SUPABASE_SERVICE_ROLE_KEY=...`.  
   Simpan file `.env.local`.

3. **Buat 5 user login (sekali jalan)**  
   Di terminal (folder project):

   ```powershell
   node --env-file=.env.local scripts/create-auth-users.mjs
   ```

   Kalau sukses, akan ada pesan "Created: ..." untuk tiap email. User bisa login dengan password **test123**.

4. **Jalankan app**  
   `npm run dev` lalu buka http://localhost:3000. Kamu akan diarahkan ke `/login`. Masuk dengan salah satu email (mis. hanssen@hanindo.co.id) dan password **test123**.

---

## 0. Login dengan email / password (Auth)

App sudah pakai **Supabase Auth**. Rekan kerja harus login dengan email @hanindo.co.id.

### Environment variables

Di root project buat `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Ambil nilai dari Supabase Dashboard → **Project Settings** → **API** (Project URL dan anon public key).

### Membuat 5 user (sekali jalan)

Supabase Dashboard tidak bisa set password bulk. Pakai script ini (perlu **service_role** key):

1. Di Supabase: **Project Settings** → **API** → copy **service_role** key (rahasia, jangan commit).
2. Set env lalu jalankan:

```bash
# Windows PowerShell
$env:SUPABASE_SERVICE_ROLE_KEY="service_role_key_dari_dashboard"
$env:NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
node scripts/create-auth-users.mjs
```

Script akan membuat user dengan password **test123** untuk:

- Kezia@hanindo.co.id  
- Dinda@hanindo.co.id  
- vira@hanindo.co.id  
- hanssen@hanindo.co.id  
- admin@hanindo.co.id  

Setelah itu mereka bisa **Sign in** di `/login` dengan email tersebut dan password `test123`.

---

## 1. Buat tabel di Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → pilih project (atau buat baru).
2. Di sidebar: **SQL Editor** → **New query**.
3. Buka file `supabase/migrations/001_initial_schema.sql` di repo ini, salin **seluruh isi** ke editor SQL.
4. Klik **Run**.

Kalau berhasil, akan ada 4 tabel:

| Tabel           | Keterangan                          |
|-----------------|-------------------------------------|
| `boards`        | Project/board (nama, workspace, stats) |
| `board_members` | Anggota per board (nama, initials, color) |
| `task_groups`   | Group tugas per board (nama, color)  |
| `tasks`         | Task per group (nama, status, due_date, priority, progress, notes) |

Relasi: `boards` → `board_members`, `task_groups` → `tasks` (dan `tasks.assignee_id` → `board_members`).

## 2. Environment variables (untuk koneksi app)

Lihat **§0** di atas. Untuk script create user saja butuh tambahan `SUPABASE_SERVICE_ROLE_KEY`.  
Jangan commit `.env.local` (biasanya sudah ada di `.gitignore`).

## 3. Langkah berikutnya (integrasi app)

Saat ini data disimpan di **localStorage** lewat `lib/utils/board-storage.ts`. Untuk menyimpan ke Supabase:

1. Pasang client: `npm install @supabase/supabase-js`
2. Buat client Supabase (mis. `lib/supabase/client.ts`) pakai `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Di `board-storage.ts` (atau layer service baru), ganti `localStorage` dengan:
   - **Read:** query `boards`, `board_members`, `task_groups`, `tasks` lalu bentuk objek `Board[]` seperti di `lib/types/board.ts`.
   - **Write:** saat create/update/delete board (atau task), panggil `insert`/`update`/`delete` ke tabel yang sesuai.

Mapping singkat:

- Satu **Board** → 1 row `boards` + N rows `board_members` + N rows `task_groups` (+ N rows `tasks` per group).
- `TaskItem` → 1 row `tasks`; `assignee_id` = `board_members.id` (uuid).
- `TaskStatus` / `TaskPriority` di DB pakai enum `task_status` dan `task_priority` (string sama dengan di TypeScript).

## 4. Row Level Security (RLS)

Di migration, RLS sudah **enabled** dengan policy "allow all" agar development mudah. Sebelum production:

- Tambah kolom `user_id` (atau `owner_id`) di `boards` jika pakai Supabase Auth.
- Ganti policy jadi `using (auth.uid() = user_id)` (atau sesuai aturan tim).

Schema lengkap dan constraint ada di `supabase/migrations/001_initial_schema.sql`.

---

## 5. Tabel workspace_members (Role per member)

Untuk fitur **Settings → Role per member** (admin/member/viewer by email), buat tabel workspace members:

1. Supabase Dashboard → **SQL Editor** → New query.
2. Jalankan:

```sql
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member', 'viewer'))
);

alter table workspace_members enable row level security;

create policy "Allow all for anon" on workspace_members
  for all using (true) with check (true);
```

3. Setelah itu, app akan baca/tulis role lewat `lib/utils/workspace-members.ts` (fallback ke localStorage jika tabel belum ada).
