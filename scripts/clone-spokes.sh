#!/usr/bin/env bash
#
# clone-spokes.sh — Clone spoke repos from spokes.yml into spokes/.
#
# Usage:
#   ./clone-spokes.sh [--override-repo=OWNER/NAME --override-ref=REF]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPOKES_YML="$ROOT_DIR/spokes.yml"

OVERRIDE_REPO=""
OVERRIDE_REF=""
for arg in "$@"; do
  case "$arg" in
    --override-repo=*) OVERRIDE_REPO="${arg#*=}" ;;
    --override-ref=*)  OVERRIDE_REF="${arg#*=}" ;;
  esac
done

mkdir -p "$ROOT_DIR/spokes"

# Parse spokes.yml line by line
CURRENT_REPO=""
CURRENT_REF=""
CURRENT_PATHS=()

process_spoke() {
  local repo="$1" ref="$2"
  shift 2
  local paths=("$@")
  [[ -z "$repo" ]] && return

  if [[ "$repo" == "$OVERRIDE_REPO" && -n "$OVERRIDE_REF" ]]; then
    ref="$OVERRIDE_REF"
    echo "=== $repo @ $ref (PR override) ==="
  else
    echo "=== $repo @ $ref ==="
  fi

  local dest="$ROOT_DIR/spokes/$(basename "$repo")"
  rm -rf "$dest"

  git clone --filter=blob:none --no-checkout --depth 1 \
    "https://github.com/${repo}.git" "$dest"
  git -C "$dest" fetch --depth 1 origin "$ref"

  if [[ ${#paths[@]} -gt 0 ]]; then
    git -C "$dest" sparse-checkout init --cone
    git -C "$dest" sparse-checkout set "${paths[@]}"
  fi
  git -C "$dest" checkout FETCH_HEAD

  echo "  done → $dest"
}

while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*repo:[[:space:]]*(.*) ]]; then
    # New spoke entry — process the previous one
    [[ -n "$CURRENT_REPO" ]] && process_spoke "$CURRENT_REPO" "$CURRENT_REF" "${CURRENT_PATHS[@]}"
    CURRENT_REPO="${BASH_REMATCH[1]}"
    CURRENT_REF="master"
    CURRENT_PATHS=()
  elif [[ "$line" =~ ^[[:space:]]*ref:[[:space:]]*(.*) ]]; then
    CURRENT_REF="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) && -n "$CURRENT_REPO" ]]; then
    CURRENT_PATHS+=("${BASH_REMATCH[1]}")
  fi
done < "$SPOKES_YML"

# Process last spoke
[[ -n "$CURRENT_REPO" ]] && process_spoke "$CURRENT_REPO" "$CURRENT_REF" "${CURRENT_PATHS[@]}"

echo "=== All spokes cloned ==="
