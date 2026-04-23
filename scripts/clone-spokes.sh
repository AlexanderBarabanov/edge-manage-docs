#!/usr/bin/env bash
#
# clone-spokes.sh — Clone spoke repos from spokes.yml into spokes/.
#
# Usage:
#   ./clone-spokes.sh [--override-repo=OWNER/NAME --override-ref=REF]
#                     [--use-local=OWNER/NAME:PATH]
#
# Options:
#   --override-repo / --override-ref
#       Replace the `ref` for a given spoke (e.g. to test a PR branch).
#   --use-local=OWNER/NAME:PATH
#       Skip cloning and symlink the spoke checkout to a local working copy
#       (useful during development). May be passed multiple times.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPOKES_YML="$ROOT_DIR/spokes.yml"

OVERRIDE_REPO=""
OVERRIDE_REF=""
LOCAL_OVERRIDE_REPOS=()
LOCAL_OVERRIDE_PATHS=()
for arg in "$@"; do
  case "$arg" in
    --override-repo=*) OVERRIDE_REPO="${arg#*=}" ;;
    --override-ref=*)  OVERRIDE_REF="${arg#*=}" ;;
    --use-local=*)
      spec="${arg#*=}"
      LOCAL_OVERRIDE_REPOS+=("${spec%%:*}")
      LOCAL_OVERRIDE_PATHS+=("${spec#*:}")
      ;;
  esac
done

lookup_local_override() {
  # $1 = repo. Echoes the local path if an override is defined, empty otherwise.
  local repo="$1" i=0
  while [[ $i -lt ${#LOCAL_OVERRIDE_REPOS[@]} ]]; do
    if [[ "${LOCAL_OVERRIDE_REPOS[$i]}" == "$repo" ]]; then
      echo "${LOCAL_OVERRIDE_PATHS[$i]}"
      return
    fi
    i=$((i + 1))
  done
}

# Check for required tools.
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
if ! command -v git-lfs >/dev/null; then
  echo "WARNING: git-lfs is not installed — LFS-tracked images in spokes will remain as pointer files and the site build will fail." >&2
fi

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

  local dest="$ROOT_DIR/spokes/$(basename "$repo")"

  # --use-local override: replace the checkout with a symlink to a local path.
  local local_path
  local_path="$(lookup_local_override "$repo")"
  if [[ -n "$local_path" ]]; then
    echo "=== $repo (local: $local_path) ==="
    rm -rf "$dest"
    ln -s "$local_path" "$dest"
    echo "  symlinked → $dest"
    return
  fi

  if [[ "$repo" == "$OVERRIDE_REPO" && -n "$OVERRIDE_REF" ]]; then
    ref="$OVERRIDE_REF"
    echo "=== $repo @ $ref (PR override) ==="
  else
    echo "=== $repo @ $ref ==="
  fi

  rm -rf "$dest"

  # Clone without blobs; we'll fetch only the subtree we need.
  # GIT_LFS_SKIP_SMUDGE avoids downloading *every* LFS object in the ref —
  # we'll pull just the files we checkout below.
  GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-checkout --depth 1 \
    "https://github.com/${repo}.git" "$dest"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dest" fetch --depth 1 origin "$ref"

  if [[ ${#paths[@]} -gt 0 ]]; then
    git -C "$dest" sparse-checkout init --cone
    git -C "$dest" sparse-checkout set "${paths[@]}"
  fi
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dest" checkout FETCH_HEAD

  # Now pull LFS objects for just the checked-out paths. Without this the
  # working tree still holds pointer files like:
  #   version https://git-lfs.github.com/spec/v1
  #   oid sha256:...
  # which Docusaurus tries to parse as real images and fails.
  if command -v git-lfs >/dev/null; then
    git -C "$dest" lfs install --local --skip-smudge >/dev/null
    if [[ ${#paths[@]} -gt 0 ]]; then
      git -C "$dest" lfs pull --include="$(IFS=,; echo "${paths[*]}")"
    else
      git -C "$dest" lfs pull
    fi
  fi

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
