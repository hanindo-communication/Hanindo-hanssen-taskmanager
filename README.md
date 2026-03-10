# Task Manager

Web app task workspace berbasis **Next.js** yang meniru pola dashboard modern ala monday.com untuk pengelolaan board, group, dan task.

## Stack

- **Next.js** App Router
- **React**
- **TypeScript**
- CSS Modules + global theme tokens

## Menjalankan Project

Pastikan memakai **Node.js 18+** lalu jalankan:

```bash
npm install
npm run dev
```

App akan tersedia di `http://localhost:3000`.

## Scripts

| Perintah | Deskripsi |
|----------|-----------|
| `npm run dev` | Jalankan server development Next.js |
| `npm run build` | Build production |
| `npm run start` | Jalankan hasil build production |

## Struktur Utama

```text
Task Manager/
├── app/
│   ├── boards/[boardId]/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── not-found.tsx
│   └── page.tsx
├── components/
│   ├── board/
│   └── dashboard/
├── lib/
│   ├── mock-data/
│   ├── types/
│   └── utils/
├── next.config.ts
├── package.json
└── tsconfig.json
```

## Fitur Saat Ini

- Sidebar workspace dan topbar ala product workspace
- Overview dashboard
- Board detail dengan `Table` dan `Kanban` view
- Grouped tasks
- Inline update untuk item, status, assignee, due date, priority, progress, dan notes
- Search dan status filter

## Catatan

Data saat ini masih memakai mock lokal di `lib/mock-data/boards.ts`, jadi belum tersambung ke database atau autentikasi.
