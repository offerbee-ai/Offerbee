# Deployment & CI/CD

OfferBee ships from GitHub Actions. Three workflows:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR to `main` (and `main`) | `pnpm typecheck` (all packages) + `pnpm --filter web-app build`. Required to merge. |
| `.github/workflows/staging-web.yml` | push to the `preview` branch | Deploys the **staging** environment: a dedicated, durable Convex `staging` deployment (data persists across deploys) + a stable Netlify alias URL (`https://staging--<site-name>.netlify.app`). |
| `.github/workflows/deploy-web.yml` | push to `main` (after PR merge) + manual | Deploys to **production**, gated behind a manual approval. |

## Branch & environment model

```
feature branch ─PR→ preview ─(staging-web)→ staging URL (stable)
                       │
                       └─PR→ main ─(deploy-web, approve)→ production (offerbee.ai)
```

- A **PR** (into `main` or `preview`) only runs **CI** (typecheck + build). There is
  no per-PR deploy — nothing to click through until the change lands on `preview`.
- The long-lived **`preview`** branch is the **staging** environment: every merge
  into it redeploys the dedicated, durable `staging` Convex deployment (plain
  `convex deploy`) at one stable URL. This is where you validate a change live
  before promoting it to production. Because staging is a standing deployment
  (not a preview), its data — seeded catalog, warmed card details, imported prod
  data — persists indefinitely and is never reclaimed.
- Merging `preview` → `main` ships production (behind the approval gate).

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
- `PLAID_CLIENT_ID` / `PLAID_SECRET` — Plaid API credentials (from the Plaid
  dashboard). Without them, `plaid.*` link/exchange/sync no-op.
- `PLAID_ENV` — `sandbox` (default) or `production`; selects the Plaid base URL.
  Use `sandbox` for dev/staging; `production` requires Plaid's Transactions-product
  approval. The Plaid webhook posts to `https://<deployment>.convex.site/plaid/webhook`.

### 4. Production Clerk instance
- Use a **production** Clerk instance (not the `*.clerk.accounts.dev` dev one).
- Create a JWT template named exactly **`convex`** with claim `{"aud": "convex"}`
  (this matches `applicationID: "convex"` in `convex/auth.config.ts`).
- Set the GitHub secrets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  to that instance's keys, and make `CLERK_JWT_ISSUER_DOMAIN` (item 3) match it.

## Staging deployment

Staging is a **dedicated, durable Convex deployment** — an additional standing
deployment within the same OfferBee Convex project (created with `convex
deployment create staging --type prod`), not an ephemeral preview. Every merge into `preview` redeploys it, so it's always the
latest validated state of that branch, and you can click through changes before
promoting to production without affecting prod. Its data persists indefinitely:
a seeded catalog, warmed card details, or data imported from prod all survive
every deploy.

**How it works:** `staging-web.yml` runs `netlify deploy --context deploy-preview`,
which selects the `[context.deploy-preview]` build in `apps/web/netlify.toml`. That
runs a plain `convex deploy` (identical to prod) — the `CONVEX_DEPLOY_KEY` (set to
`CONVEX_STAGING_DEPLOY_KEY`) determines the target deployment — and builds the web
app against its Convex URL. Netlify publishes to the stable alias
`https://staging--offerbee-web.netlify.app`, so the URL never changes between
deploys.

### One-time setup for staging (needs a repo admin)

1. **Create the staging deployment (same project)** — Convex supports additional
   durable deployments within a project, so no separate project is needed. From
   `packages/backend`, logged in with org access (`npx convex login`):
   ```sh
   npx convex deployment create staging --type prod
   npx convex deployment token create staging-ci --deployment staging
   ```
   The first creates a durable `staging` deployment in the existing OfferBee
   project; the second prints a deploy key scoped to it. Add that key as the
   GitHub secret `CONVEX_STAGING_DEPLOY_KEY` (distinct from prod
   `CONVEX_DEPLOY_KEY`). Its data/functions/env are isolated from prod.
2. **Staging deployment env vars** — set on the staging deployment (dashboard, or
   `convex env set --deployment <staging>`):
   - `CLERK_JWT_ISSUER_DOMAIN` — else `auth.config.ts` throws and the `convex
     deploy` step fails. Use the dev/staging Clerk issuer
     (`https://<slug>.clerk.accounts.dev`) to match the `pk_test` keys below.
   - `RAPIDAPI_KEY` — needed for card search/detail (and `warmOnboardingCards`).
3. **Seed once** — because staging is durable, seed data (e.g. import prod card
   data) and run `convex run rapidapi:warmOnboardingCards {}` **once** against the
   staging deployment; it then persists across all future deploys.
4. Nothing to add for Netlify — staging publishes under the existing site
   (`NETLIFY_SITE_ID`); the workflow reuses `NETLIFY_AUTH_TOKEN`.
5. **Sign-in on the staging URL** — staging serves at
   `staging--offerbee-web.netlify.app`, a non-`offerbee.ai` origin. The prod Clerk
   instance (`pk_live`, served from `clerk.offerbee.ai`) rejects non-`offerbee.ai`
   origins, so prod keys make sign-in 400 there. To make auth work, use a Clerk
   **development** instance: add GitHub secrets `CLERK_PUBLISHABLE_KEY_PREVIEW`
   (`pk_test…`) and `CLERK_SECRET_KEY_PREVIEW` (`sk_test…`), and set the staging
   deployment's `CLERK_JWT_ISSUER_DOMAIN` (item 2) to that dev instance's issuer
   (`https://<slug>.clerk.accounts.dev`). Dev instances accept any origin, so no
   custom domain is needed. `staging-web.yml` prefers these and falls back to the
   prod keys when absent, so the deploy stays green either way.

## Rollback

- **Web (Netlify):** Deploys → pick the previous good deploy → **Publish deploy**
  (instant). Or re-run the deploy workflow from an earlier commit.
- **Backend (Convex):** `convex deploy` from an earlier commit, or roll back in the
  Convex dashboard. Note: forward-only schema changes (e.g. a dropped table) are
  **not** automatically reversible — restore data separately if needed.

## GitHub Actions secrets used

`CONVEX_DEPLOY_KEY` (prod), `CONVEX_STAGING_DEPLOY_KEY` (staging),
`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, and — optional, for staging sign-in —
`CLERK_PUBLISHABLE_KEY_PREVIEW` + `CLERK_SECRET_KEY_PREVIEW` (Clerk dev instance).
