# NEC GATE Preparation Portal — Frontend

React + Vite + TypeScript + Tailwind frontend for the NEC GATE Preparation backend.

## Stack
- Vite 5 / React 18 / TypeScript 5
- Tailwind 3 (custom navy + amber brand)
- React Router v6 (nested routes)
- TanStack Query (server cache)
- React Hook Form + Zod (forms)
- Axios (with refresh-token interceptor)
- Radix UI primitives (dialogs, dropdowns)
- dnd-kit (reorder UX)
- sonner (toasts)

## Getting started

```bash
cd frontend
npm install
cp .env.example .env.local       # adjust VITE_API_BASE if backend is not on :5000
npm run dev
```

Dev server runs on `http://localhost:5173` and proxies `/api` → `http://localhost:5000`.

## Folder layout

```
src/
  app/                 router, route guards
  components/
    layout/            PublicLayout, AppShell
    ui/                Button, Input, Field, Dialog, Logo, Spinner, Badge, PageContainer
  lib/
    api/               axios client + endpoint groupings
    auth/              AuthContext + tokenStore
    cn.ts              tailwind class merger
    format.ts          date / duration / initials helpers
  pages/
    public/            Home / AboutUs / AboutPortal / Login / ForgotPassword
    practice/          (Phase 4)
    test/              (Phase 5)
    tutor/             (Phase 6)
    admin/             (Phase 7)
    progress/          (Phase 8)
    profile/           (Phase 3)
  types/api.ts         shared API types matching backend envelope
```

## Auth flow

- Access token lives **in memory only** (`lib/auth/tokenStore.ts`) — never localStorage.
- Refresh token lives in the httpOnly cookie set by backend `POST /auth/login`.
- On app boot, `AuthProvider` calls `POST /auth/refresh` once to attempt session restoration.
- Axios interceptor catches `401` (except for `/auth/login` and `/auth/refresh`), calls refresh once (single-flight), and retries the original request.

## Build phases

| Phase | Status | Scope |
|---|---|---|
| 1 | Done | Tooling + skeleton |
| 2 | Done | Auth + public pages |
| 3 | Next | Header shell with role-aware nav + profile dropdown |
| 4 | Pending | Practice (subjects → topics → levels → sets → attempt) |
| 5 | Pending | Tests (list, create, attempt, submission flow) |
| 6 | Pending | Tutorward |
| 7 | Pending | Admin |
| 8 | Pending | Progress + Leaderboard |
