# OfferBee.ai

A TypeScript monorepo (Turborepo + pnpm) with a shared Convex backend powering a Next.js web app and an Expo native app. Auth is via Clerk. Scaffolded from `get-convex/turbo-expo-nextjs-clerk-convex-monorepo`.

## Structure

- `apps/web` — Next.js 16 (App Router), package name `web-app`
- `apps/native` — Expo SDK 55 (Expo Router), package name `native-app`
- `packages/backend` — Convex backend + generated API types, package name `@packages/backend`
- `logos/` — brand assets

## Package manager

**Use pnpm (pinned to `10.33.0` via `packageManager`), never npm or yarn.** The workspace uses `workspace:*` dependencies that npm cannot resolve. Install deps in the package that uses them:

```sh
pnpm --filter web-app add <pkg>
pnpm --filter native-app add <pkg>
pnpm --filter @packages/backend add <pkg>
```

## Commands

- `pnpm dev` — run backend + web + native together via Turbo
- `pnpm --filter native-app dev` — Expo only (press `i`/`a` for simulators, or scan QR with Expo Go)
- `pnpm --filter web-app dev` — Next.js only
- `pnpm --filter @packages/backend dev` — Convex dev server only
- `pnpm build` / `pnpm typecheck` / `pnpm format` — across the workspace via Turbo

## Environment

Secrets live in git-ignored `.env.local` files (never commit them):

- `apps/web/.env.local` — `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `apps/native/.env.local` — `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Convex-side env (set in the Convex dashboard, not files): `CLERK_JWT_ISSUER_DOMAIN`, optional `OPENAI_API_KEY`

`CONVEX_URL` comes from `packages/backend/.env.local` after running `pnpm --filter @packages/backend setup`.

## Conventions

- Convex code lives in `packages/backend/convex`. Follow Convex best practices: always declare arg validators (`v.*`), use the object-form function syntax, and keep sensitive logic in `internal*` functions.
- Note ownership is enforced server-side in `packages/backend/convex/notes.ts`.
- The web app protects note routes via `apps/web/src/proxy.ts`.
- The native app uses Expo Router route groups under `apps/native/src/app`.
- After changing Convex functions/schema, the generated `_generated/` types update via the running `convex dev` — don't hand-edit them.

## Deploy

From `packages/backend`:

```sh
pnpm exec convex deploy --cmd 'cd ../../apps/web && pnpm build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

`apps/web/vercel.json` is preconfigured for this flow on Vercel.
