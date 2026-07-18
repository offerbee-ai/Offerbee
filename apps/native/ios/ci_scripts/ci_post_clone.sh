#!/bin/sh
set -eu

# Xcode Cloud post-clone step. Xcode Cloud runs ci_scripts located NEXT TO the
# built workspace — for this monorepo that is apps/native/ios/ci_scripts.
#
# Managed Expo + pnpm monorepo: install JS + native deps so xcodebuild finds Pods.
#
# ⚠️ `expo prebuild --clean` wipes all of apps/native/ios, including this file. A
# copy also lives at the repo root (ci_scripts/) as insurance; if you re-prebuild,
# restore this one (or add a config plugin that regenerates it).

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
echo "▶︎ repo root: $REPO_ROOT"

# Node (match local: 22). Homebrew is preinstalled on Xcode Cloud runners.
if ! command -v node >/dev/null 2>&1; then
  echo "▶︎ installing Node via Homebrew"
  brew install node@22
  brew link --overwrite --force node@22
fi
echo "▶︎ node $(node -v)"

# pnpm (pinned). Installed via npm global — corepack's signed fetch of pnpm is
# flaky on fresh CI runners ("cannot find matching keyid"), so avoid it.
npm install -g pnpm@10.33.0
echo "▶︎ pnpm $(pnpm -v)"

# Install the workspace (full, so the workspace:* link to @packages/backend resolves).
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

# CocoaPods for the iOS project.
cd "$REPO_ROOT/apps/native/ios"
command -v pod >/dev/null 2>&1 || brew install cocoapods
pod install --repo-update

echo "✅ ci_post_clone complete"
