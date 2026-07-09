# Deployment & CI/CD

OfferBee ships from GitHub Actions. Two workflows:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR to `main` (and `main`) | `pnpm typecheck` (all packages) + `pnpm --filter web-app build`. Required to merge. |
| `.github/workflows/deploy-web.yml` | push to `main` (after PR merge) + manual | Deploys to **production**, gated behind a manual approval. |

## How a change reaches production

1. Open a PR → **CI** runs typecheck + web build. A red check blocks merge.
2. Merge to `main` → **deploy-web** starts but **pauses on the `production` environment gate**.
3. A required reviewer approves the run in the **Actions** tab.
4. The build (`apps/web/netlify.toml`) runs `convex deploy` (backend → prod Convex)
   which injects `NEXT_PUBLIC_CONVEX_URL`, then `next build`, and Netlify publishes
   the site to production.

Nothing reaches users without step 3.

## One-time setup (needs a repo admin)

### 1. Approval gate — `Settings → Environments → production`
- Create the `production` environment (or let the first deploy run create it).
- Add **Required reviewers** (the people allowed to approve prod deploys).
- Optionally move the deploy secrets onto this environment so they are only
  exposed after approval: `CONVEX_DEPLOY_KEY`, `NETLIFY_AUTH_TOKEN`,
  `NETLIFY_SITE_ID`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

### 2. Required checks — `Settings → Branches → main` (branch protection)
- Require pull requests before merging.
- Require status checks to pass: **`typecheck`** and **`build-web`**.

### 3. Production Convex deployment env vars
The prod Convex deployment is separate from dev and does not inherit its env.
Set (dashboard for the prod deployment, or `convex env set`):
- `CLERK_JWT_ISSUER_DOMAIN` — the **production** Clerk issuer, **including `https://`**
  (e.g. `https://clerk.offerbee.ai`). If missing, `auth.config.ts` throws and the
  `convex deploy` step fails.
- `RAPIDAPI_KEY` — the Rewards Credit Card API key. Without it, card search and
  detail fetches no-op.
- `EXPO_ACCESS_TOKEN` — optional, for higher Expo push limits.

### 4. Production Clerk instance
- Use a **production** Clerk instance (not the `*.clerk.accounts.dev` dev one).
- Create a JWT template named exactly **`convex`** with claim `{"aud": "convex"}`
  (this matches `applicationID: "convex"` in `convex/auth.config.ts`).
- Set the GitHub secrets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  to that instance's keys, and make `CLERK_JWT_ISSUER_DOMAIN` (item 3) match it.

## Rollback

- **Web (Netlify):** Deploys → pick the previous good deploy → **Publish deploy**
  (instant). Or re-run the deploy workflow from an earlier commit.
- **Backend (Convex):** `convex deploy` from an earlier commit, or roll back in the
  Convex dashboard. Note: forward-only schema changes (e.g. a dropped table) are
  **not** automatically reversible — restore data separately if needed.

## GitHub Actions secrets used

`CONVEX_DEPLOY_KEY`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
