# edge-manage-docs

Documentation hub for the OpenVINO ecosystem (prototype). Renders one
Docusaurus site that aggregates docs from multiple "spoke" repositories
listed in [`spokes.yml`](spokes.yml).

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

Every build emits a single Docusaurus bundle that always includes the
hub landing at `/`. The mode env var selects which spoke docs plugins
are wired in alongside it. Exactly one mode env var must be set; the
build aborts otherwise.

| Env | Used by | Bundle contents |
|---|---|---|
| `HUB_ONLY=1` | `deploy.yml` (push to main / tag) | Hub landing only. |
| `BUILD_ALL_SPOKES=1` | `deploy.yml` (PR preview) | Hub + every spoke under its `routeBasePath`. |
| `SPOKE=<id>` | `deploy.yml` (merge) | Hub + that spoke under its `routeBasePath`. |
| `SPOKE=<id>` + `SPOKE_VERSION=vX.Y` | `deploy.yml` (release) | Hub + that spoke under `<routeBasePath>/<vX.Y>/`. |

---

## Pipeline triggers

Hub workflows are driven by `repository_dispatch` events sent by spokes
(each spoke owns a thin "trigger" workflow that authenticates via a
shared GitHub App).

### PR preview — `pr/<spoke>/<N>/`

Trigger: PR labeled `deploy-doc-preview`, or new commit on a labeled PR.
Workflow: [`deploy.yml`](.github/workflows/deploy.yml) (preview mode).

Builds a bundle containing the hub landing and every spoke (the source
spoke pinned to the PR commit) and syncs it to
`<DEV_BUCKET>/pr/<spoke>/<N>/`. The PR is commented with the preview URL.

### PR merge — `/` + `/<spoke>/`

Trigger: PR closed with `merged == true` and the `deploy-doc-preview`
label.
Workflow: [`deploy.yml`](.github/workflows/deploy.yml) (merge mode).

Builds a bundle containing the hub landing and the merged spoke, then
syncs to `<DEV_BUCKET>/` with `--exclude` patterns that protect other
spokes' subtrees and the `pr/` previews. Removes the corresponding PR
preview prefix.

### PR closed without merging — cleanup

Trigger: PR closed, not merged.
Hub workflow: [`deploy-spoke.yml`](.github/workflows/deploy-spoke.yml)
(close mode).

Removes `<DEV_BUCKET>/pr/<spoke>/<N>/`.

### Release — `<spoke>/<vX.Y>/`

Trigger: tag push matching `v[0-9]+.[0-9]+.[0-9]+`.
Workflow: [`deploy.yml`](.github/workflows/deploy.yml) (release mode).

Builds a bundle containing the hub landing and the spoke mounted under
`<routeBasePath>/<vX.Y>/`, then syncs to `<PROD_BUCKET>/` with
`--exclude` / `--include` patterns that protect other spokes, other
versions of this spoke, and the `pr/` previews. A meta-refresh
`<spoke>/index.html` is written to redirect the unversioned URL to the
latest published version.

### Hub root — `/`

Workflow: [`deploy.yml`](.github/workflows/deploy.yml) (hub-only mode).

Triggers:
- Push to `main` → deploy to **dev**.
- Push of a tag matching `v*` → deploy to **prod**.

Builds with `HUB_ONLY=1` and syncs to the bucket root with
`--exclude` patterns that preserve every spoke subtree and the
`pr/` previews.

This is the **only** workflow that publishes the hub root; existing
spoke deployments at `<bucket>/<spoke>/` are preserved on every run.

---

## Concurrency

`deploy.yml` runs share a `concurrency` group keyed on the source
repo + PR/tag (or `dev-hub` / `prod-hub` for push events), so events
for the same target never race.

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
