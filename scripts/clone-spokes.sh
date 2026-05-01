#!/usr/bin/env bash
#
# clone-spokes.sh — Clone spoke repos from spokes.yml into spokes/.
#
# Usage:
#   ./clone-spokes.sh [--override=OWNER/NAME:REF ...]
#                     [--override-repo=OWNER/NAME --override-ref=REF]
#                     [--use-local=OWNER/NAME:PATH ...]
#                     [--only=SPOKE_ID ...]
#
# Environment:
#   SPOKE_OVERRIDES  Whitespace-separated list of OWNER/NAME:REF specs.
#                    Equivalent to passing one --override per spec. Useful
#                    when the script is invoked indirectly (e.g. via an
#                    `npm run` lifecycle hook) where CLI flags can't be
#                    threaded through.
#   ONLY_SPOKES      Whitespace-separated list of spoke ids. Equivalent to
#                    passing one --only per id.
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
#   --only=SPOKE_ID
#       Restrict cloning to the given spoke id(s) from spokes.yml. When
#       omitted, all spokes are cloned. Used by the release workflow (which
#       only needs the spoke being released) and by anyone wanting a hub-
#       only build (pass `--only=` with no ids, or skip this script entirely).
#       May be passed multiple times.
#
# In GitHub Actions this script is driven by a `repository_dispatch` event
# from each spoke. The spoke's workflow sends its repo, branch, and commit
# SHA; the hub workflow translates that into a `SPOKE_OVERRIDES="<repo>:<sha>"`
# environment variable so the built site reflects the spoke's pre-merge state.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPOKES_YML="$ROOT_DIR/spokes.yml"

OVERRIDE_REPOS=()
OVERRIDE_REFS=()
LOCAL_OVERRIDE_REPOS=()
LOCAL_OVERRIDE_PATHS=()
ONLY_IDS=()

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
    --only=*)
      id="${arg#*=}"
      [[ -n "$id" ]] && ONLY_IDS+=("$id")
      ;;
  esac
done
if [[ -n "$LEGACY_OVERRIDE_REPO" && -n "$LEGACY_OVERRIDE_REF" ]]; then
  add_override "${LEGACY_OVERRIDE_REPO}:${LEGACY_OVERRIDE_REF}"
fi

# HUB_ONLY=1 — skip cloning entirely. Used by deploy-hub.yml so the
# subsequent docusaurus build emits just the hub landing.
if [[ "${HUB_ONLY:-}" == "1" ]]; then
  echo "HUB_ONLY=1: skipping spoke cloning."
  exit 0
fi

# SPOKE_OVERRIDES env var: whitespace-separated list of OWNER/NAME:REF specs.
# Lets callers pass overrides through wrappers that don't forward argv
# (e.g. `npm run build`, whose lifecycle auto-runs `prebuild` with no args).
if [[ -n "${SPOKE_OVERRIDES:-}" ]]; then
  for spec in $SPOKE_OVERRIDES; do
    [[ -n "$spec" ]] && add_override "$spec"
  done
fi

# Build mode (mirrors docusaurus.config.ts validation):
#   BUILD_ALL_SPOKES=1 → clone every spoke
#   SPOKE=<id>         → clone just that one
# Exactly one must be set when HUB_ONLY is unset.
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
if [[ -n "$SPOKE_ID" ]]; then
  ONLY_IDS+=("$SPOKE_ID")
fi

is_only_id() {
  # $1 = id. Returns 0 if id is in ONLY_IDS or ONLY_IDS is empty (no filter).
  [[ ${#ONLY_IDS[@]} -eq 0 ]] && return 0
  local id="$1" i=0
  while [[ $i -lt ${#ONLY_IDS[@]} ]]; do
    [[ "${ONLY_IDS[$i]}" == "$id" ]] && return 0
    i=$((i + 1))
  done
  return 1
}

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

# Remove any versioning symlinks left over from a previous run; they are
# (re)created below for each spoke that contributes versioning artifacts.
# Only matches the well-known names so unrelated files in the hub root are
# untouched.
for f in "$ROOT_DIR"/versions.json "$ROOT_DIR"/versioned_docs "$ROOT_DIR"/versioned_sidebars \
         "$ROOT_DIR"/*_versions.json "$ROOT_DIR"/*_versioned_docs "$ROOT_DIR"/*_versioned_sidebars; do
  [[ -L "$f" ]] && rm -f "$f"
done

# Spoke whose versioning files become the *default* docs plugin's
# (unprefixed) inputs. This must match docusaurus.config.ts, which wires
# `spokes[0]` via presets.classic — and `spokes` there is itself filtered
# by the build mode:
#   • BUILD_ALL_SPOKES → spokes = allSpokes  → default = allSpokes[0]
#   • SPOKE=<id>      → spokes = [<id>]     → default = <id>
# Mirror that here. SPOKE_ID is set from `--only` / SPOKE=<id> handling
# above; otherwise we fall back to the first id encountered in spokes.yml.
FIRST_SPOKE_ID="${SPOKE_ID:-}"

link_versioning() {
  # $1 = spoke id, $2 = spoke checkout dir (relative to ROOT_DIR).
  # Stages the spoke's docs-versions/ artifacts into the hub root using the
  # names docusaurus' versioning plugin expects:
  #   default plugin  → versions.json, versioned_docs/, versioned_sidebars/
  #   non-default     → <id>_versions.json, <id>_versioned_docs/, <id>_versioned_sidebars/
  #
  # We *copy* (not symlink) because docusaurus' docs plugin builds webpack
  # `include` rules from siteDir-relative paths, while webpack's
  # `resolve.symlinks: true` normalises imported files to their real path —
  # so a symlinked versioned_docs/ would never match the include rule and
  # the MDX loader would skip every versioned file. Copying keeps the file's
  # real path under siteDir.
  local id="$1" dir="$2"
  local src="$ROOT_DIR/$dir/docs-versions"
  if [[ ! -d "$src" ]]; then
    echo "  no docs-versions/ in $dir; skipping versioning artifacts."
    return
  fi
  local prefix=""
  if [[ "$id" != "$FIRST_SPOKE_ID" ]]; then
    prefix="${id}_"
  fi
  rm -rf "$ROOT_DIR/${prefix}versioned_docs" "$ROOT_DIR/${prefix}versioned_sidebars"
  rm -f  "$ROOT_DIR/${prefix}versions.json"
  cp     "$src/versions.json"        "$ROOT_DIR/${prefix}versions.json"
  cp -R  "$src/versioned_docs"       "$ROOT_DIR/${prefix}versioned_docs"
  cp -R  "$src/versioned_sidebars"   "$ROOT_DIR/${prefix}versioned_sidebars"
  echo "  versioning → ${prefix}versions.json, ${prefix}versioned_{docs,sidebars}/"
}

# Parse spokes.yml line by line
CURRENT_REPO=""
CURRENT_REF=""
CURRENT_ID=""
CURRENT_PATHS=()

process_spoke() {
  local repo="$1" ref="$2" id="$3"
  shift 3
  local paths=("$@")
  [[ -z "$repo" ]] && return

  if ! is_only_id "$id"; then
    echo "=== $repo (id=$id) skipped (not in --only filter) ==="
    return
  fi

  local dest="$ROOT_DIR/spokes/$(basename "$repo")"

  # --use-local override: replace the checkout with a symlink to a local path.
  local local_path
  local_path="$(lookup_local_override "$repo")"
  if [[ -n "$local_path" ]]; then
    echo "=== $repo (local: $local_path) ==="
    rm -rf "$dest"
    ln -s "$local_path" "$dest"
    echo "  symlinked → $dest"
    link_versioning "$id" "spokes/$(basename "$repo")"
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
  link_versioning "$id" "spokes/$(basename "$repo")"
}

while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*repo:[[:space:]]*(.*) ]]; then
    # New spoke entry — process the previous one
    [[ -n "$CURRENT_REPO" ]] && process_spoke "$CURRENT_REPO" "$CURRENT_REF" "$CURRENT_ID" "${CURRENT_PATHS[@]}"
    CURRENT_REPO="${BASH_REMATCH[1]}"
    CURRENT_REF="master"
    CURRENT_ID=""
    CURRENT_PATHS=()
  elif [[ "$line" =~ ^[[:space:]]*ref:[[:space:]]*(.*) ]]; then
    CURRENT_REF="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]*id:[[:space:]]*(.*) ]]; then
    CURRENT_ID="${BASH_REMATCH[1]}"
    [[ -z "$FIRST_SPOKE_ID" ]] && FIRST_SPOKE_ID="$CURRENT_ID"
  elif [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) && -n "$CURRENT_REPO" ]]; then
    CURRENT_PATHS+=("${BASH_REMATCH[1]}")
  fi
done < "$SPOKES_YML"

# Process last spoke
[[ -n "$CURRENT_REPO" ]] && process_spoke "$CURRENT_REPO" "$CURRENT_REF" "$CURRENT_ID" "${CURRENT_PATHS[@]}"

echo "=== All spokes cloned ==="
