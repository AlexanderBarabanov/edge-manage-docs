# Building this site locally

This is a quick, task-focused companion to [`CONTRIBUTING.md`](CONTRIBUTING.md)'s
"Local development" section, written specifically to answer: how do I build
locally, can I build without the API reference docs, and how long should each
step take.

## Prerequisites

- Node.js **>= 22** (the repo's engine requirement; check with `node --version`).
- `git` (and `git-lfs` if a spoke uses LFS-tracked assets).
- `yq` — required by `npm run gen-samples` (the GenAI samples-doc generation
  step in the `prebuild` chain). Not currently listed in `CONTRIBUTING.md`;
  install it (e.g. `apt install yq` / `brew install yq`) if `npm run build`
  fails at the `gen-samples` step with `yq: command not found`.
- Only if you also want the **API reference** step (see below): a local
  OpenVINO Sphinx documentation build (see
  `openvino/docs/documentation_build_instructions.md` in the OpenVINO repo).
  See "What must be kept from the Sphinx/OpenVINO doc stack" below for
  exactly what that entails and why it can't be replaced by anything in
  this repo.

## What must be kept from the Sphinx/OpenVINO doc stack

The API reference integration (below) does **not** convert or render API
documentation — `tools/integrate_api_docs.py` only copies an **already
Sphinx-built** HTML tree into this repo's `static/` directory and rewrites
its internal links so they work inside Docusaurus. Docusaurus never parses
Python/C++/Node.js source; it has no knowledge of the API content at all.
Concretely, this means the following has to keep existing and keep being
run — in the **OpenVINO GitHub repo** (`openvinotoolkit/openvino`, e.g. the
`releases/2026/*` branches used for the published `docs.openvino.ai/2026`
site), independently of anything in this repo:

- The Sphinx documentation build itself (`docs/` tree,
  `docs/sphinx_setup`, `docs/documentation_build_instructions.md`), plus
  its Python dependencies in `docs/requirements.txt`.
- The CMake documentation toggles: `ENABLE_DOCS` (always needed),
  `ENABLE_PYTHON_API` (drives the Python API reference via Sphinx's
  `autodoc`/`autosummary` against the installed `openvino` package —
  this is what currently produces the Python pages this integration
  consumes).
- `ENABLE_CPP_API` and its Doxygen/Graphviz/LaTeX/`breathe` toolchain, if
  C++ API docs are ever folded into this integration (not done yet — see
  "Known gaps" below).
- The Node.js API reference source
  (`docs/sphinx_setup/api/nodejs_api/`) — already plain, committed RST
  parsed unconditionally by Sphinx; no extra toolchain or CMake flag
  needed for it specifically.

In short: adopting this Docusaurus-based narrative site does **not**
retire the existing Sphinx/OpenVINO doc-build pipeline. Both stacks have
to be maintained and built side by side for as long as API reference docs
are sourced this way; this repo only consumes that pipeline's output, it
doesn't replace any part of it.

### Known gaps

- **C++ API docs** are not wired into `tools/integrate_api_docs.py` at
  all yet — still deferred, bigger toolchain lift (Doxygen + Graphviz +
  LaTeX).
- **Node.js API docs**, although low-effort to add, are also not wired in
  yet.
- Both are tracked as follow-up work, not represented by anything in
  "Building WITH the API reference docs" below (which currently covers
  the Python API reference only).

## Building WITHOUT the API reference docs (default)

This is the default — the API reference integration step is strictly
opt-in and does nothing unless you explicitly enable it.

```sh
export SITE_URL=https://docs.example.com   # required; any placeholder works locally
export SPOKE=openvino                      # build just this one spoke
npm run build
npm run serve                              # serve build/ at http://localhost:3000
```

`npm run build` runs, in order: `clone-spokes` (clones/refreshes each active
spoke's content into `spokes/`), `gen-samples` (GenAI samples-doc generation,
no-op for spokes that don't use it), `gen-api-docs` (no-ops immediately
because `INCLUDE_API_DOCS` is unset — see below), then `docusaurus build`
(typecheck + lint + the actual Docusaurus/webpack build).

**Measured timing** (this machine, `SPOKE=openvino`, spoke already cloned
locally so `clone-spokes` has nothing to fetch):

| Step | Time |
|---|---|
| `docusaurus build` (narrative docs only, ~512 pages) | **~2m15s** |

(`clone-spokes`/`gen-samples` add more on a first run, depending on network
speed and git-lfs transfer size; they're near-instant once a spoke is already
cloned locally.)

## Building WITH the API reference docs

Set `INCLUDE_API_DOCS=1` and point `OPENVINO_SPHINX_BUILD_DIR` at an existing
Sphinx documentation build output (defaults to `~/openvino/build/docs/_build`
if unset):

```sh
export SITE_URL=https://docs.example.com
export SPOKE=openvino
export INCLUDE_API_DOCS=1
export OPENVINO_SPHINX_BUILD_DIR=~/openvino/build/docs/_build   # optional, this is the default
npm run build
npm run serve
```

This requires the Sphinx build to already exist — it is **not** built by
this repo. Build it first from an OpenVINO checkout (see
`docs/documentation_build_instructions.md` there); with
`-DENABLE_CPP_API=OFF -DENABLE_PYTHON_API=ON` it currently takes roughly
20-30 minutes on this machine, is a one-time/occasional cost, and is entirely
separate from the timings below.

When `INCLUDE_API_DOCS=1`, the extra `gen-api-docs` step runs
`tools/integrate_api_docs.py` (in the sibling `docusaurus converter/tools/`
checkout), which copies the raw Sphinx HTML output plus shared static assets
into `static/`, resolves filename collisions, rewrites every internal/nav
link to work inside Docusaurus, and validates there are zero broken links.

**Measured timing** (same machine, Python API only, 2,875 files):

| Step | Time |
|---|---|
| `gen-api-docs` (`integrate_api_docs.py` copy + link-rewrite + validation) | **~3m** |
| `docusaurus build` (narrative docs + API reference, static-asset copy) | **~1m-1m25s** |
| **Total added vs. the no-API build** | **~4-4.5m** |

The API reference pages are copied as static assets rather than compiled by
Docusaurus, which is why they add comparatively little to the `docusaurus
build` step itself — nearly all of the extra time is the one-time
`gen-api-docs` copy/validation pass.

## Where the output lands

After either build, the generated static site is at:

```
edge-manage-docs/build/
```

For a `SPOKE=openvino` build specifically, the pages of interest are under:

- Narrative docs: `build/openvino/docs/...`
  (e.g. `build/openvino/docs/get-started/install-openvino/index.html`)
- API reference (only if `INCLUDE_API_DOCS=1`): `build/openvino/api/...`
  (e.g. `build/openvino/api/ie_python_api/api.html`)
- Shared static assets used by both: `build/openvino/_static/...`

`build/` is gitignored — nothing under it is committed; it's regenerated by
the commands above.

## Where the source files live

- **Narrative docs source** (the migrated Markdown/MDX corpus): in this local
  dev setup, `spokes/openvino` is a symlink to
  `/home/michalx/.local/ov-docs-preview/docusaurus-docs/docs/` — a plain
  staging directory from the earlier narrative migration project, not a git
  repository. In a normal (non-local-symlink) setup, `clone-spokes.sh` clones
  this content from the spoke's real git repo per `spokes.yml`.
- **API reference source**: the Sphinx documentation build output pointed to
  by `OPENVINO_SPHINX_BUILD_DIR` (default `~/openvino/build/docs/_build`),
  itself built from `openvinotoolkit/openvino`'s `docs/` tree.

## CI: what still needs to be configured (not yet implemented)

Everything above describes the **local, manual** workflow only. This
repo's CI (`.github/workflows/deploy.yml`, the reusable workflow used by
both the hub and per-spoke preview deploys) currently just runs
`npm run build` with no API-docs env vars set at all — it never sets
`INCLUDE_API_DOCS` or `OPENVINO_SPHINX_BUILD_DIR`, so **every CI-built
deployment today ships without API reference docs**, regardless of this
integration existing. Wiring that up is still open work, not yet started:

- At minimum, a CI job needs to: (1) produce a Sphinx build of the
  Python API reference (and, once supported, C++/Node.js) from the
  OpenVINO repo, (2) make that output available to this repo's build step
  (e.g. as a build artifact or a checked-out path), and (3) set
  `INCLUDE_API_DOCS=1` and `OPENVINO_SPHINX_BUILD_DIR` to point at it
  before `npm run build` runs.
- **Existing production publishing today already has Jenkins jobs with
  checkboxes to enable/disable publishing the Python/C++/Node.js API
  docs** (driving the current Sphinx-based `docs.openvino.ai` publish).
  One plausible direction is to **keep those checkboxes as the trigger for
  step (1) above** (building/producing the Sphinx API output) and add a
  new step that feeds that output into this repo's build via
  `tools/integrate_api_docs.py` (i.e. step (3) above) — so the existing
  Jenkins-side on/off control is preserved rather than duplicated.
  **This is not a decided design** — it needs to be worked out together
  with whoever owns the Jenkins/CI pipeline, since it depends on details
  of that pipeline (artifact handoff mechanism, build agents, timing)
  not visible from this repo alone.
- No work has started on this; this section exists to flag it as the next
  concrete step before API reference docs can go live in any real
  deployment, not to describe something already built.
