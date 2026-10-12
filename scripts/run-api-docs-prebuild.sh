#!/usr/bin/env bash
#
# run-api-docs-prebuild.sh — optional prebuild step that copies the raw
# Sphinx-built OpenVINO API reference HTML (Python API only for now) into
# `static/api/`, with every link rewritten to work from inside this
# Docusaurus build. No-ops unless INCLUDE_API_DOCS=1, mirroring the
# ROOT_REDIRECT=1 no-op convention in run-spoke-prebuild.sh.
#
# Env vars:
#   INCLUDE_API_DOCS=1          Required to do anything at all.
#   OPENVINO_SPHINX_BUILD_DIR   Sphinx build output root (passed through to
#                               the integration script). Defaults to
#                               ~/openvino/build/docs/_build there.
#   INTEGRATE_API_DOCS_SCRIPT   Path to tools/integrate_api_docs.py. Default
#                               assumes the current local-only layout
#                               (`docusaurus converter/edge-manage-docs` +
#                               sibling `docusaurus converter/tools/`). A
#                               future CI job supplies its own checkout
#                               layout via this var — no script changes
#                               needed, per the plan's "CI-agnostic" design
#                               (reports/plan-2026-10-12-api-docs-integration.md
#                               section 2b).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${INCLUDE_API_DOCS:-}" != "1" ]]; then
  echo "INCLUDE_API_DOCS!=1: skipping API-docs integration."
  exit 0
fi

SCRIPT="${INTEGRATE_API_DOCS_SCRIPT:-$ROOT_DIR/../tools/integrate_api_docs.py}"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Error: INCLUDE_API_DOCS=1 but the integration script was not found at:" >&2
  echo "  $SCRIPT" >&2
  echo "Set INTEGRATE_API_DOCS_SCRIPT to its actual location." >&2
  exit 1
fi

echo "→ INCLUDE_API_DOCS=1: running $SCRIPT"
python3 "$SCRIPT" --target-dir "$ROOT_DIR/static/api"
