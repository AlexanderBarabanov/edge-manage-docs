#!/usr/bin/env bash
#
# clone-spokes.sh — Clone spoke repos from spokes.yml into spokes/.
#
# Usage:
#   ./clone-spokes.sh [--override=OWNER/NAME:REF ...]
#                     [--override-repo=OWNER/NAME --override-ref=REF]
#                     [--use-local=OWNER/NAME:PATH ...]
#
# Options:
#   --override=OWNER/NAME:REF
#       Replace the `ref` for a single spoke (branch, tag, or full SHA).
#       May be passed multiple times — typically once per spoke that the
#       dispatching repository_dispatch event targets.
#   --override-repo / --override-ref
#       Legacy single-spoke form of the above. Kept for backward compat.
#   --use-local=OWNER/NAME:PATH
#       Skip cloning and symlink the spoke checkout to a local working copy
#       (useful during development). May be passed multiple times.
#
# In GitHub Actions this script is driven by a `repository_dispatch` event
# from each spoke. The spoke's workflow sends its repo, branch, and commit
# SHA; the hub workflow translates that into a `--override=<repo>:<sha>`
# argument so the built site reflects the spoke's pre-merge state.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPOKES_YML="$ROOT_DIR/spokes.yml"

OVERRIDE_REPOS=()
OVERRIDE_REFS=()
LOCAL_OVERRIDE_REPOS=()
LOCAL_OVERRIDE_PATHS=()

add_override() {
  # $1 = OWNER/NAME:REF
  local spec="$1"
  OVERRIDE_REPOS+=("${spec%%:*}")
  OVERRIDE_REFS+=("${spec#*:}")
}

LEGACY_OVERRIDE_REPO=""
LEGACY_OVERRIDE_REF=""
for arg in "$@"; do
  case "$arg" in
    --override=*)      add_override "${arg#*=}" ;;
    --override-repo=*) LEGACY_OVERRIDE_REPO="${arg#*=}" ;;
    --override-ref=*)  LEGACY_OVERRIDE_REF="${arg#*=}" ;;
    --use-local=*)
      spec="${arg#*=}"
      LOCAL_OVERRIDE_REPOS+=("${spec%%:*}")
      LOCAL_OVERRIDE_PATHS+=("${spec#*:}")
      ;;
  esac
done
if [[ -n "$LEGACY_OVERRIDE_REPO" && -n "$LEGACY_OVERRIDE_REF" ]]; then
  add_override "${LEGACY_OVERRIDE_REPO}:${LEGACY_OVERRIDE_REF}"
fi

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

lookup_ref_override() {
  # $1 = repo. Echoes the override ref if defined, empty otherwise.
  local repo="$1" i=0
  while [[ $i -lt ${#OVERRIDE_REPOS[@]} ]]; do
    if [[ "${OVERRIDE_REPOS[$i]}" == "$repo" ]]; then
      echo "${OVERRIDE_REFS[$i]}"
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

  # --override=<repo>:<ref> replaces the ref declared in spokes.yml for this
  # spoke. Used by the hub's repository_dispatch workflow to build against a
  # spoke's PR branch or a specific commit SHA.
  local override_ref
  override_ref="$(lookup_ref_override "$repo")"
  if [[ -n "$override_ref" ]]; then
    ref="$override_ref"
    echo "=== $repo @ $ref (override) ==="
  else
    echo "=== $repo @ $ref ==="
  fi

  rm -rf "$dest"

  # Clone without blobs; we'll fetch only the subtree we need.
  # GIT_LFS_SKIP_SMUDGE avoids downloading *every* LFS object in the ref —
  # we'll pull just the files we checkout below.
  GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-checkout --depth 1 \
    "https://github.com/${repo}.git" "$dest"
  # `ref` may be a branch, tag, or a commit SHA. GitHub allows fetching
  # any reachable SHA directly.
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
