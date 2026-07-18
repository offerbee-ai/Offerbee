# TestFlight → App Store via Xcode Cloud (single-bundle model)

Ship the OfferBee native app to TestFlight and eventually the App Store using
**Xcode Cloud** + your Apple Developer account. **No EAS** builds or submits.

## The model: one bundle id, backend chosen at build time

There is **one shipping app**, `ai.offerbee.app`, with **one App Store Connect
record** that carries from beta all the way to public launch. Bundle id is
decoupled from backend — the only difference between a beta build and a launch
build is the embedded `EXPO_PUBLIC_*` env, set per Xcode Cloud workflow.

| Build | Bundle id | Backend | Delivers to | Workflow |
|---|---|---|---|---|
| Beta / QA | `ai.offerbee.app` | **staging** `adept-porpoise-776`, Clerk `pk_test_…` | TestFlight | staging (build now) |
| Launch | `ai.offerbee.app` | **prod** `handsome-dodo-841`, Clerk `pk_live_…` | App Store | prod (launch-time) |

`development` stays isolated (`ai.offerbee.app.dev`, scheme `offerbee-dev`) so a
local dev build installs side-by-side with the shipping app. `preview` and
`production` in `app.config.ts` now share the shipping identity (`ai.offerbee.app`,
scheme `offerbee`); they differ only by backend env.

> **Discipline (the one real risk):** same bundle = a staging-pointed build *could*
> be shipped to the public. Keep two clearly-named, separate workflows and never
> hand-edit env between runs. Final launch QA: upload a **prod-env** build to
> TestFlight, verify, then release *that* build to the App Store.

---

## What's already done in the repo (preview branch)

- `app.config.ts` — `preview` + `production` → `ai.offerbee.app` / scheme `offerbee` / name `OfferBee`; `development` unchanged.
- `apps/native/ios/` — prebuilt and **committed** (was CNG-generated + gitignored):
  - project / workspace / scheme: **`OfferBee`**
  - bundle id `ai.offerbee.app`, display name `OfferBee`
  - `Podfile.lock` committed; `ios/Pods/`, `ios/build/`, xcuserdata stay gitignored.
- `apps/native/ios/ci_scripts/ci_post_clone.sh` — installs Node 22 + pnpm 10.33.0, `pnpm install --frozen-lockfile` at repo root, then `pod install`. Lets Xcode Cloud build a pnpm-monorepo Expo app.
- `eas.json` has a `testflight` profile — **unused** (we build via Xcode Cloud).

### Staging workflow env vars (⚠️ required — this is the beta/prod switch)

A Release archive defaults to embedding `.env.production` (prod). To make the
**staging** TestFlight build point at staging, set these as **Xcode Cloud workflow
environment variables** (all public `EXPO_PUBLIC_*`, safe to store):

| Variable | Value |
|---|---|
| `APP_ENV` | `preview` |
| `EXPO_PUBLIC_CONVEX_URL` | `https://adept-porpoise-776.convex.cloud` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_ZWxlZ2FudC11bmljb3JuLTU1LmNsZXJrLmFjY291bnRzLmRldiQ` |

---

## Step A — Create the App Store Connect app record

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
2. Platform **iOS**; **Bundle ID** = `ai.offerbee.app`.
   - If missing from the dropdown, register it at
     [developer.apple.com → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
3. Name `OfferBee`, primary language, SKU (e.g. `offerbee`).
4. Create. (No metadata/screenshots needed for TestFlight.)

## Step B — Signing team in Xcode

1. Point Xcode at full Xcode.app (yours currently targets CommandLineTools):
   ```sh
   sudo xcode-select -s /Applications/Xcode.app   # or Xcode-beta.app
   ```
2. `open apps/native/ios/OfferBee.xcworkspace`
3. Target **OfferBee** → **Signing & Capabilities** → **Automatically manage
   signing** → select your **Team**.

## Step C — Commit + push to preview

Xcode Cloud builds from the repo, so push before creating the workflow:

```sh
git add apps/native/ios apps/native/.gitignore apps/native/app.config.ts apps/native/eas.json apps/native/docs
git commit -m "chore(native): commit ai.offerbee.app ios project + Xcode Cloud CI"
git push origin preview
```

## Step D — Create the STAGING Xcode Cloud workflow

1. Xcode → **Product ▸ Xcode Cloud ▸ Create Workflow** (Integrate menu). Sign in as
   **Account Holder / Admin**.
2. Grant access to the **GitHub** repo. First time on `offerbee-ai`: the Xcode
   Cloud GitHub app must be installed/approved by an org admin.
3. Workspace **`apps/native/ios/OfferBee.xcworkspace`**, scheme **`OfferBee`**.
4. Name it clearly, e.g. **"TestFlight (staging)"**. Start Condition: Branch
   `preview` (or Manual).
5. **Environment variables** — add the three from the table above. ⚠️ Don't skip;
   this is what makes the build hit staging instead of prod.
6. **Action: Archive** — iOS, Configuration **Release**.
7. **Post-Action: TestFlight (Internal Testing)** → app `ai.offerbee.app`.
8. Save. Xcode Cloud runs `ci_post_clone.sh` → resolves deps → archives → uploads.

## Step E — Export compliance + testers

1. App Store Connect → app → **TestFlight**.
2. **Export compliance**: standard/exempt encryption (HTTPS) → answer accordingly.
   Make it permanent via `app.config.ts` → `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`.
3. **Internal testers** install immediately; **external testers** need a one-time
   Beta App Review.

---

## Launch-time follow-up (separate effort)

1. Put the real prod Clerk key (`pk_live_…`) in `.env.production`.
2. Second Xcode Cloud workflow **"Release (prod)"**, same workspace/scheme, on a
   prod branch, env vars → prod Convex + `pk_live_…`, Archive → **App Store**
   delivery (or TestFlight → promote the exact build to the store).
3. App Store listing metadata, screenshots, privacy, review submission.

## Maintenance

- **Native config changed** (`app.config.ts`, a plugin, a native dep): regenerate +
  re-commit:
  ```sh
  cd apps/native && APP_ENV=production npx expo prebuild -p ios --clean
  cd ios && pod install
  git add apps/native/ios && git commit -m "chore(native): re-prebuild ios"
  ```
  (`APP_ENV=preview` gives an identical native project — both map to `ai.offerbee.app`.)
- **Local dev churn**: `expo run:ios` (dev) rewrites `ios/` to the *dev* config
  (`OfferBeeDev` / `.dev`). Don't commit that on `preview` — `git checkout apps/native/ios` to discard.
- **Watch-item**: no `.npmrc`, so pnpm uses symlinked node_modules (resolves fine
  today). If a Xcode Cloud build can't resolve a native module, add `.npmrc` with
  `node-linker=hoisted` and re-commit.
