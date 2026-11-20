# DealFlow frontend

The DealFlow frontend is a React single-page application for the business
acquisition marketplace.

## Technology

- React and TypeScript, built with Vite
- Tailwind CSS 4 with its Vite plugin
- shadcn/ui component conventions and generated-style source components
- React Router for client-side routes
- TanStack Query for server state
- Axios for HTTP requests
- React Hook Form and Zod for later form workflows
- Lucide React icons and Inter Variable typography

## Folder structure

```text
public/
src/
├── app/
│   ├── providers/
│   └── router/
├── components/
│   ├── shared/
│   └── ui/
├── features/
│   └── landing/
├── lib/
├── styles/
├── types/
├── App.tsx
└── main.tsx
```

## Install and run

Use Node.js 24 and npm from this directory:

```sh
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173`.

## Environment variables

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the backend
API base URL. The default points to the local backend at
`http://localhost:3000/api`. Vite exposes variables prefixed with `VITE_` to
browser code, so do not put secrets in frontend environment files.

The API client is configured for credentialed requests and an in-memory CSRF
header hook for a later authentication phase. It does not store JWTs in browser
storage.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

`npm run build` also runs TypeScript project checks before creating production
assets in `dist/`.
