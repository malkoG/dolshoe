# web

A minimal TanStack Start app with one route and plain CSS.

Run the full stack, including this app with HMR and a proxied API, from the
repository root with `docker compose up` — see the [root README](../../README.md#quick-start)
for discovering the dev server's URL, rebuilds, logs, and shutdown.

For frontend-only work, this app can also run standalone on the host:

```bash
pnpm install
pnpm dev
```

This starts a Vite dev server on `http://localhost:3000` without the API
proxy, so requests to `/api/*` are not forwarded anywhere; use it for
UI-only iteration, not for testing API integration.

Edit `src/routes/index.tsx` to get started. Add route files under
`src/routes`; TanStack Router updates `src/routeTree.gen.ts` for you.

Build the production app with:

```bash
pnpm build
```
