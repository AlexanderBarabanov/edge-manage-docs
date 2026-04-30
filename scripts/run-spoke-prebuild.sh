#!/usr/bin/env bash
#
# run-spoke-prebuild.sh — Run each active spoke's `prebuildCommands` from
# spokes.yml as `docusaurus <command>`.
#
# Active spokes are picked the same way as clone-spokes.sh:
#   HUB_ONLY=1          → none
#   BUILD_ALL_SPOKES=1  → every spoke
#   SPOKE=<id>          → just that one
#
# A spoke entry may declare:
#   prebuildCommands:
#     - generate-samples-docs:genai-samples-docs-plugin
#     - <other docusaurus subcommand>
# Spokes with no entry contribute nothing.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPOKES_YML="$ROOT_DIR/spokes.yml"

if [[ "${HUB_ONLY:-}" == "1" ]]; then
  echo "HUB_ONLY=1: skipping spoke prebuild commands."
  exit 0
fi

BUILD_ALL_SPOKES_FLAG="${BUILD_ALL_SPOKES:-}"
SPOKE_ID="${SPOKE:-}"
if [[ "$BUILD_ALL_SPOKES_FLAG" == "1" && -n "$SPOKE_ID" ]]; then
  echo "Error: BUILD_ALL_SPOKES=1 and SPOKE=$SPOKE_ID are mutually exclusive." >&2
  exit 1
fi
if [[ "$BUILD_ALL_SPOKES_FLAG" != "1" && -z "$SPOKE_ID" ]]; then
  echo "Error: set BUILD_ALL_SPOKES=1 or SPOKE=<id> (HUB_ONLY=1 already handled above)." >&2
  exit 1
fi

# Build the yq filter that selects the active spokes.
if [[ "$BUILD_ALL_SPOKES_FLAG" == "1" ]]; then
  SELECT='.spokes[]'
else
  # shellcheck disable=SC2016
  SELECT='.spokes[] | select(.id == strenv(SPOKE_ID))'
fi

# Emit one "<spoke_id> <command>" line per command to run. Commands are
# Docusaurus CLI subcommands and never contain whitespace.
LINES=$(SPOKE_ID="$SPOKE_ID" yq -r \
  "${SELECT} | .id as \$id | .prebuildCommands[]? | \$id + \" \" + ." \
  "$SPOKES_YML")

if [[ -z "$LINES" ]]; then
  echo "No spoke prebuild commands to run."
  exit 0
fi

while read -r id cmd; do
  [[ -z "$id" ]] && continue
  echo "→ [$id] docusaurus $cmd"
  npx --no-install docusaurus "$cmd"
done <<< "$LINES"
