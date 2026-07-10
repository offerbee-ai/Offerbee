# Deployment & CI/CD

OfferBee ships from GitHub Actions. Four workflows:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR to `main` (and `main`) | `pnpm typecheck` (all packages) + `pnpm --filter web-app build`. Required to merge. |
| `.github/workflows/preview-web.yml` | every PR to `main` or `preview` | Deploys an **ephemeral, per-PR** Convex preview backend + Netlify deploy preview, comments the URL on the PR. Never touches prod. |
| `.github/workflows/staging-web.yml` | push to the `preview` branch | Deploys a **persistent staging** environment: one fixed Convex `staging` backend + a stable URL `https://staging--offerbee-web.netlify.app`. |
| `.github/workflows/deploy-web.yml` | push to `main` (after PR merge) + manual | Deploys to **production**, gated behind a manual approval. |

## Branch & environment model

```
feature branch ─PR→ preview ─(staging-web)→ staging URL (stable)
                       │
                       └─PR→ main ─(deploy-web, approve)→ production (offerbee.ai)
```

- Any **PR** (into `main` or `preview`) gets its own **ephemeral** preview (unique
  URL + isolated DB, auto-cleaned after merge). Good for reviewing one change.
- The long-lived **`preview`** branch is a **persistent staging** environment: every
  merge into it redeploys the same `staging` backend at one stable URL.
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

Each PR to `main` gets its own throwaway backend + web preview, so you can click
through a change before merging without affecting production.

**How it works:** `preview-web.yml` runs `netlify deploy --context deploy-preview`,
which selects the `[context.deploy-preview]` build in `apps/web/netlify.toml`. That
runs `convex deploy --preview-create <branch> --preview-run seed:run`: Convex creates
(or updates) a **preview deployment** named after the PR branch — a fully isolated
backend with its own **empty** database — seeds its card catalog via
`convex/seed.ts` (`seed:run`, internal), and builds the web app against the preview
Convex URL. Netlify publishes a unique deploy-preview URL, which the workflow posts
as a PR comment (updated in place on each push). Merging or closing the PR is when
you'd let the preview go stale; Convex reclaims idle preview deployments.

Because wallet/notification data is keyed by the signed-in Clerk subject, only the
(user-independent) card catalog is seeded — sign in on the preview and add cards to
exercise user flows.

### One-time setup for previews (needs a repo admin) — **requires Convex Pro**

Preview deployments are a paid Convex feature. Once on Pro:

1. **Preview deploy key** — Convex dashboard → Project Settings → **Deploy Keys** →
   *Generate Preview Deploy Key*. Add it as the GitHub secret
   `CONVEX_PREVIEW_DEPLOY_KEY` (distinct from the prod `CONVEX_DEPLOY_KEY`).
2. **Preview env vars** — Convex dashboard → Settings → **Environment Variables** →
   *Preview* scope. Set the same auth/API vars the backend needs at deploy/runtime:
   - `CLERK_JWT_ISSUER_DOMAIN` — else `auth.config.ts` throws and the preview
     `convex deploy` fails. A dev/staging Clerk issuer is fine here.
   - `RAPIDAPI_KEY` — optional for previews (the seed covers browseable content);
     without it live card search/detail no-op on the preview.
3. Nothing to add for Netlify — deploy previews live under the existing site
   (`NETLIFY_SITE_ID`); the workflow reuses `NETLIFY_AUTH_TOKEN`.

## Rollback

- **Web (Netlify):** Deploys → pick the previous good deploy → **Publish deploy**
  (instant). Or re-run the deploy workflow from an earlier commit.
- **Backend (Convex):** `convex deploy` from an earlier commit, or roll back in the
  Convex dashboard. Note: forward-only schema changes (e.g. a dropped table) are
  **not** automatically reversible — restore data separately if needed.

## GitHub Actions secrets used

`CONVEX_DEPLOY_KEY` (prod), `CONVEX_PREVIEW_DEPLOY_KEY` (PR previews),
`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`.
