# Deployment & CI/CD

OfferBee ships from GitHub Actions. Three workflows:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR to `main` (and `main`) | `pnpm typecheck` (all packages) + `pnpm --filter web-app build`. Required to merge. |
| `.github/workflows/staging-web.yml` | push to the `preview` branch | Deploys the **staging** environment: one fixed Convex `staging` preview backend (reused between deploys) + a stable Netlify alias URL (`https://staging--<site-name>.netlify.app`). |
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
  into it redeploys the same `staging` backend (`--preview-create "staging"`, data reused) at
  one stable URL. This is where you validate a change live before promoting it to
  production. Caveat: Convex still expires preview deployments 5–14 days after
  creation, so staging data is durable between deploys but not forever — when it
  expires, the next push recreates it empty.
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

### 4. Production Clerk instance
- Use a **production** Clerk instance (not the `*.clerk.accounts.dev` dev one).
- Create a JWT template named exactly **`convex`** with claim `{"aud": "convex"}`
  (this matches `applicationID: "convex"` in `convex/auth.config.ts`).
- Set the GitHub secrets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  to that instance's keys, and make `CLERK_JWT_ISSUER_DOMAIN` (item 3) match it.

## Preview deployments

There is a single, persistent preview environment — **staging** — instead of a
throwaway backend per PR. Every merge into `preview` redeploys it, so it's always
the latest validated state of that branch, and you can click through changes
before promoting them to production without affecting prod.

**How it works:** `staging-web.yml` runs `netlify deploy --context deploy-preview`,
which selects the `[context.deploy-preview]` build in `apps/web/netlify.toml`. That
runs `convex deploy --preview-create "staging"`: Convex **reuses** the preview
deployment named `staging` (and its data) if it exists — creating it only when it
has been reclaimed — and builds the web app against its Convex URL. (The Convex
CLI has no `--preview-name` flag; `--preview-create <name>` is create-or-reuse.)
Netlify publishes to the stable alias
`https://staging--offerbee-web.netlify.app`, so the URL never changes between
deploys.

The catalog fills from **live card search** (RapidAPI) exactly like dev/prod — no
seed step. Convex still expires preview deployments **5 days after creation** (14
days on paid plans) regardless of activity; when `staging` expires, the next merge
into `preview` recreates it with an empty catalog that re-fills from live search.

### One-time setup for previews (needs a repo admin)

Preview deployments work on **all Convex plans** (free previews just auto-delete
after 5 days). Setup (this applies to the single `staging` backend):

1. **Preview deploy key** — Convex dashboard → Project Settings → **Deploy Keys** →
   *Generate Preview Deploy Key*. Add it as the GitHub secret
   `CONVEX_PREVIEW_DEPLOY_KEY` (distinct from the prod `CONVEX_DEPLOY_KEY`).
2. **Preview default env vars** — Convex dashboard → Project Settings → *Project
   default environment variables*, deployment type **Preview**. These apply to
   every new preview/staging backend:
   - `CLERK_JWT_ISSUER_DOMAIN` — else `auth.config.ts` throws and the preview
     `convex deploy` fails. A dev/staging Clerk issuer is fine here.
   - `RAPIDAPI_KEY` — needed for card search/detail to work on previews (this is
     how the catalog populates); without it search/detail no-op.
3. Nothing to add for Netlify — deploy previews live under the existing site
   (`NETLIFY_SITE_ID`); the workflow reuses `NETLIFY_AUTH_TOKEN`.

## Rollback

- **Web (Netlify):** Deploys → pick the previous good deploy → **Publish deploy**
  (instant). Or re-run the deploy workflow from an earlier commit.
- **Backend (Convex):** `convex deploy` from an earlier commit, or roll back in the
  Convex dashboard. Note: forward-only schema changes (e.g. a dropped table) are
  **not** automatically reversible — restore data separately if needed.

## GitHub Actions secrets used

`CONVEX_DEPLOY_KEY` (prod), `CONVEX_PREVIEW_DEPLOY_KEY` (staging),
`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`.
