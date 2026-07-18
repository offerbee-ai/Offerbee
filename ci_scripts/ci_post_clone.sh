#!/bin/zsh

# Xcode Cloud post-clone step for the OfferBee native app (managed Expo, pnpm monorepo).
#
# LOCATION MATTERS: this lives at the REPOSITORY ROOT (ci_scripts/), not inside
# apps/native/ios/. Xcode Cloud scans the repo root for ci_scripts, and — critically
# — `expo prebuild --clean` wipes the entire apps/native/ios/ directory, so a script
# placed there gets deleted on every regeneration. Keep it here.
#
# Xcode Cloud runs this after cloning, before it resolves deps and builds. The
# committed apps/native/ios project is the source of truth (bundle ai.offerbee.app);
# this only installs the JS + native deps the build needs — it does NOT re-run
# `expo prebuild`.
#
# Xcode Cloud env: CI_PRIMARY_REPOSITORY_PATH = repo checkout root.
# Runners have Homebrew + CocoaPods; Node is NOT preinstalled — we add it.

set -euo pipefail
set -x

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
NATIVE_DIR="$REPO_ROOT/apps/native"

echo "▶︎ repo root: $REPO_ROOT"

# 1. Node (match local: Node 22). Homebrew is preinstalled on Xcode Cloud runners.
if ! command -v node >/dev/null 2>&1; then
  echo "▶︎ installing Node via Homebrew"
  brew install node@22
  brew link --overwrite --force node@22
fi
echo "▶︎ node $(node -v)"

# 2. pnpm (pinned to the root package.json `packageManager` version) via corepack.
corepack enable
corepack prepare pnpm@10.33.0 --activate
echo "▶︎ pnpm $(pnpm -v)"

# 3. Install the workspace. Full install so the workspace:* link to @packages/backend
#    resolves exactly as it does locally. --frozen-lockfile keeps CI honest.
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

# 4. CocoaPods for the iOS project (Podfile.lock committed → deterministic).
cd "$NATIVE_DIR/ios"
if ! command -v pod >/dev/null 2>&1; then
  echo "▶︎ installing CocoaPods"
  brew install cocoapods
fi
pod install --repo-update

echo "✅ ci_post_clone complete"
