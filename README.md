# edge-manage-docs

Documentation hub for Intel® Edge AI projects. Renders one Docusaurus site
that aggregates docs from multiple "spoke" repositories listed in
[`spokes.yml`](spokes.yml).

For day-to-day contribution guidelines (adding spokes, landing pages,
generated docs) see [`CONTRIBUTING.md`](CONTRIBUTING.md). This file
documents the publishing pipeline — what gets built, where it lands, and
when.

---

## Buckets and URL layout

Two S3 buckets, each fronted by its own CloudFront distribution.

### Dev bucket — work in progress

```
<DEV_BUCKET>/
├── index.html                 ← hub root landing (multi-spoke shell)
├── <spoke>/                   ← latest merged docs for each spoke
│   └── …
└── pr/
    └── <spoke>/<N>/           ← PR previews, one folder per (spoke, PR#)
```

- `<spoke>/` reflects the latest commit merged to the spoke's default
  branch (`main` / `master`).
- `pr/<spoke>/<N>/` reflects the head of an open PR carrying the
  `deploy-doc-preview` label. Namespaced by spoke so PR numbers from
  different spoke repos can't collide.

### Prod bucket — released documentation

```
<PROD_BUCKET>/
├── index.html                 ← hub root landing (multi-spoke shell)
├── <spoke>/
│   ├── index.html             ← redirect to the latest spoke version
│   ├── v1.0/                  ← immutable per-spoke-version releases
│   ├── v1.1/
│   └── v1.2/
```

- Each `<spoke>/<vX.Y>/` is built once per release tag, then overwritten
  in place when a patch on that version lands.
- `<spoke>/index.html` is a meta-refresh redirect that always points at
  the most recently deployed version of that spoke.

---

## Build modes

The site can be built in three shapes. Exactly one mode env var must be
set; the build aborts otherwise.

| Env | Used by | What it produces |
|---|---|---|
| `HUB_ONLY=1` | `deploy-hub.yml` | Just the hub landing page, 404, and shared assets. |
| `SPOKE=<id>` | `deploy-spoke.yml` (merge / release) | One spoke's docs, served standalone at the spoke's URL prefix (`<bucket>/<spoke>/` or `<bucket>/<spoke>/<vX.Y>/`). |
| `BUILD_ALL_SPOKES=1` | `deploy-spoke.yml` (preview) | Every spoke under its `routeBasePath`, no hub root. The hub root for a PR preview is layered on top by a chained `deploy-hub.yml` call. |

---

## Pipeline triggers

Hub workflows are driven by `repository_dispatch` events sent by spokes
(each spoke owns a thin "trigger" workflow that authenticates via a
shared GitHub App).

### PR preview — `pr/<spoke>/<N>/`

Trigger: PR labeled `deploy-doc-preview`, or new commit on a labeled PR.
Hub workflow: [`deploy-spoke.yml`](.github/workflows/deploy-spoke.yml)
(preview mode).

Builds every spoke with the source spoke pointed at the PR commit,
deploys each spoke subtree to `<DEV_BUCKET>/pr/<spoke>/<N>/<rbp>/`, then
chains `deploy-hub.yml` to layer the hub root at the same prefix and
comments on the PR with the preview URL.

### PR merge — `/` + `/<spoke>/`

Trigger: PR closed with `merged == true` and the `deploy-doc-preview`
label.
Hub workflow: [`deploy-spoke.yml`](.github/workflows/deploy-spoke.yml)
(merge mode).

Publishes the merged spoke at `<DEV_BUCKET>/<spoke>/`, then chains
`deploy-hub.yml` to refresh the dev hub root, and removes the PR
preview.

### PR closed without merging — cleanup

Trigger: PR closed, not merged.
Hub workflow: [`deploy-spoke.yml`](.github/workflows/deploy-spoke.yml)
(close mode).

Removes `<DEV_BUCKET>/pr/<spoke>/<N>/`.

### Release — `<spoke>/<vX.Y>/`

Trigger: tag push matching `v[0-9]+.[0-9]+.[0-9]+`.
Hub workflow: [`deploy-spoke.yml`](.github/workflows/deploy-spoke.yml)
(release mode).

Builds the spoke at the release commit and deploys it to
`<PROD_BUCKET>/<spoke>/<vX.Y>/`. `<PROD_BUCKET>/<spoke>/index.html` is a
redirect that always points at the most recently deployed spoke version.
Patch releases overwrite their version prefix in place; older versions
are untouched. After the spoke deploy, `deploy-hub.yml` is chained to
refresh the prod hub root.

### Hub root — `/`

Hub workflow: [`deploy-hub.yml`](.github/workflows/deploy-hub.yml).

Triggers:
- Push to `main` that touches hub-owned paths → deploy to **dev**.
- Push of a tag matching `v*` → deploy to **prod**.
- `workflow_dispatch` → manual rerun.
- `workflow_call` from `deploy-spoke.yml` → layer the hub root on top of
  a freshly deployed spoke (preview / merge / release).

This is the **only** workflow that publishes the hub root; existing
spoke deployments at `<bucket>/<spoke>/` are preserved on every run.

---

## Concurrency

`deploy-spoke.yml` runs share a `concurrency` group keyed on
`<source_repo>-<pr_number|tag>`, so preview / merge / close events for
the same PR never race, and releases serialise per tag.

---

## Required secrets

| Secret | Used by | Purpose |
|---|---|---|
| `DEV_ROLE`, `DEV_BUCKET`, `DEV_URL` | preview / merge / close | Dev S3 deploy + comment URLs |
| `PROD_ROLE`, `PROD_BUCKET`, `PROD_URL` | release | Prod S3 deploy |
| `DOC_HELPER_APP_ID`, `DOC_HELPER_APP_PRIVATE_KEY` | preview | GitHub App used to comment back on the source-spoke PR |

Spokes additionally need `DOC_HUB_APP_ID`, `DOC_HUB_APP_PRIVATE_KEY`, and
`DOC_HUB_REPO` to dispatch into the hub.

---

## Local development

```sh
# Symlink a local spoke checkout instead of cloning from GitHub.
./scripts/clone-spokes.sh \
  --use-local=openvinotoolkit/openvino.genai:/abs/path/to/openvino.genai

# Multi-spoke build (matches PR preview).
BUILD_ALL_SPOKES=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build

# Single-spoke build (matches merge / release pipeline). The spoke is
# mounted at /.
SPOKE=genai BASE_URL=/genai/v1.2/ SITE_URL=https://docs.example.com npm run build

# Hub-only build (matches deploy-hub.yml). Skips spoke cloning entirely.
HUB_ONLY=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor
workflow.
