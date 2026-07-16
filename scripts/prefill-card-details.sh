#!/usr/bin/env bash
#
# Prefill cardDetails (rewards, benefits, image, fee) for the cards in our
# catalog. Two modes:
#
#   warm  [dev|prod|<deployment-name>]   Fetch missing/stale details from the
#                                        Rewards API on that deployment. Runs
#                                        rapidapi:prefillCatalog, which walks the
#                                        catalog one card at a time, spaced to
#                                        respect the BASIC per-second rate limit,
#                                        skipping cards that are already fresh.
#                                        Safe to re-run; self-schedules in the
#                                        background.
#
#   copy  <src> <dst>                    Copy cardCatalog + cardDetails from one
#                                        deployment to another with NO API calls
#                                        (export → strip system fields → import
#                                        --replace). Use this to seed staging/prod
#                                        from a warmed dev, avoiding the rate
#                                        limit. Only these two tables are touched.
#
# Deployment tokens: dev (default deployment in .env.local), prod, or an
# explicit Convex deployment name (e.g. kindhearted-jackal-408 for staging).
#
# Examples:
#   scripts/prefill-card-details.sh warm dev
#   scripts/prefill-card-details.sh warm prod
#   scripts/prefill-card-details.sh copy dev kindhearted-jackal-408
# nounset (-u) is intentionally off: macOS bash 3.2 errors on "${empty_array[@]}",
# which is exactly what the dev (no-flags) case produces.
set -eo pipefail

cd "$(dirname "$0")/../packages/backend"

# Map a deployment token to convex CLI flags (word-split intentionally at call site).
dep_flags() {
  case "$1" in
    dev) printf '' ;;
    prod) printf -- '--prod' ;;
    *) printf -- '--deployment %s' "$1" ;;
  esac
}

mode="${1:-}"

case "$mode" in
  warm)
    target="${2:-dev}"
    FLAGS=()
    read -r -a FLAGS <<<"$(dep_flags "$target")"
    echo "▶ Prefilling catalog on '$target' from the Rewards API (spaced; skip-fresh; safe to re-run)…"
    npx convex run rapidapi:prefillCatalog '{}' "${FLAGS[@]}"
    echo "✓ Kicked off — it self-schedules through the catalog in the background."
    echo "  Watch:  npx convex logs ${FLAGS[*]}"
    ;;

  copy)
    src="${2:?usage: copy <src> <dst>}"
    dst="${3:?usage: copy <src> <dst>}"
    SRC_FLAGS=()
    DST_FLAGS=()
    read -r -a SRC_FLAGS <<<"$(dep_flags "$src")"
    read -r -a DST_FLAGS <<<"$(dep_flags "$dst")"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT

    # Seed both catalog + details: a fresh deployment needs cardCatalog for the
    # local search index / name fallback and cardDetails for images + fees.
    TABLES="cardCatalog cardDetails"

    echo "▶ Exporting from '$src'…"
    npx convex export --path "$tmp/src.zip" "${SRC_FLAGS[@]}" >/dev/null
    (cd "$tmp" && unzip -o src.zip >/dev/null)

    for table in $TABLES; do
      docs="$tmp/$table/documents.jsonl"
      if [ ! -f "$docs" ]; then
        echo "  – $table: absent on '$src', skipping"
        continue
      fi
      # Strip _id/_creationTime so import assigns fresh ids (avoids duplicate
      # cardKeys — .unique() lookups would throw on dupes).
      node -e '
        const fs = require("fs");
        const src = process.argv[1], out = process.argv[2], name = process.argv[3];
        const rows = fs.readFileSync(src, "utf8").trim().split("\n").filter(Boolean)
          .map((l) => { const r = JSON.parse(l); delete r._id; delete r._creationTime; return JSON.stringify(r); });
        fs.writeFileSync(out, rows.join("\n") + "\n");
        console.log("  – " + name + ": " + rows.length + " rows");
      ' "$docs" "$tmp/$table.jsonl" "$table"
      # --replace swaps the table contents atomically (no duplicate cardKeys).
      npx convex import --table "$table" --replace "$tmp/$table.jsonl" "${DST_FLAGS[@]}" -y >/dev/null
    done
    echo "✓ Copied [$TABLES]: $src → $dst"
    ;;

  *)
    echo "Usage:"
    echo "  $0 warm [dev|prod|<deployment-name>]"
    echo "  $0 copy <src> <dst>"
    exit 1
    ;;
esac
