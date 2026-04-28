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
│   ├── index.html             ← redirect to the latest minor
│   ├── v1.0/                  ← immutable per-minor releases
│   ├── v1.1/
│   └── v1.2/
```

- Each `<spoke>/<vX.Y>/` is built once per release tag, then overwritten
  in place when a patch on that minor lands.
- `<spoke>/index.html` is a meta-refresh redirect that always points at
  the most recently deployed minor of that spoke.

---

## Build modes

The `docusaurus.config.ts` produces two shapes of build, controlled
by `ONLY_SPOKE`:

| Mode | Trigger | `ONLY_SPOKE` | `BASE_URL` example | Output shape |
|---|---|---|---|---|
| Monolithic | PR preview | unset | `/pr/genai/12` | All spokes mounted under their `routeBasePath`; hub root landing at `/` |
| Single-spoke | PR merge / Release | `<spoke>` | `/genai` or `/genai/v1.2` | One spoke mounted at `/`; hub root landing dropped (`pages: false`) |

The single-spoke build's `build/` directory is the spoke's docs tree
directly, so it can be `aws s3 sync`'d to `<bucket>/<spoke>/` or
`<bucket>/<spoke>/<vX.Y>/` without any path rewriting.

---

## Pipeline triggers

All hub workflows are driven by `repository_dispatch` events sent by the
spokes. Each spoke owns its own thin "trigger" workflow that authenticates
via a GitHub App token shared with the hub.

### PR preview — `pr/<spoke>/<N>/`

Spoke event: PR labeled `deploy-doc-preview`, or new commit pushed to a
PR that already has the label.

Hub workflow: [`publish-preview.yml`](.github/workflows/publish-preview.yml)
in **preview mode**.

1. Validate sender, payload, spoke allowlist, and that `commit_sha`
   matches the PR head.
2. Full **monolithic** build of every spoke, with the source spoke
   overridden to `commit_sha`. `BASE_URL=/pr/<spoke>/<N>`,
   `SITE_URL=$DEV_URL`.
3. `aws s3 sync --delete build/` → `<DEV_BUCKET>/pr/<spoke>/<N>/`.
4. Comment on the PR with the preview URL.

### PR merge — `<spoke>/`

Spoke event: PR closed with `merged == true` and the `deploy-doc-preview`
label.

Hub workflow: [`publish-preview.yml`](.github/workflows/publish-preview.yml)
in **merge mode** (selected by `branch ∈ {main, master}`).

1. Validate the merge commit (PR head SHA, merge commit SHA, or any
   commit reachable from the merged branch).
2. **Single-spoke** build (`ONLY_SPOKE=<id>`). `BASE_URL=/<spoke>`,
   `SITE_URL=$DEV_URL`.
3. `aws s3 sync --delete build/` → `<DEV_BUCKET>/<spoke>/`.
4. `aws s3 rm --recursive` → `<DEV_BUCKET>/pr/<spoke>/<N>/` (cleanup).

### PR closed without merging — cleanup

Spoke event: PR closed, not merged, label still present.

Hub workflow: [`close-preview.yml`](.github/workflows/close-preview.yml).

1. `aws s3 rm --recursive` → `<DEV_BUCKET>/pr/<spoke>/<N>/`.

### Release — `<spoke>/<vX.Y>/`

Spoke event: tag push matching `v[0-9]+.[0-9]+.[0-9]+`.

Hub workflow: [`publish-release.yml`](.github/workflows/publish-release.yml).

1. Validate the tag format and that it points at `commit_sha`.
2. Derive `<minor> = vMAJOR.MINOR` from the tag.
3. **Single-spoke** build (`ONLY_SPOKE=<id>`).
   `BASE_URL=/<spoke>/<minor>`, `SITE_URL=$PROD_URL`.
4. `aws s3 sync --delete build/` → `<PROD_BUCKET>/<spoke>/<minor>/`.
5. Write `<PROD_BUCKET>/<spoke>/index.html` — a meta-refresh redirect to
   `<minor>/`. The redirect always points at the most recently deployed
   minor.

Patch releases (`v1.2.3` → `v1.2.4`) overwrite the `<spoke>/v1.2/` prefix
in place; older minors are left untouched.

---

## Concurrency

All three dev workflows share a `concurrency` group keyed on
`<source_repo>-<pr_number>`, so a `merge` event for a PR will never race
the `preview` deploy for the same PR or its `close` cleanup. Releases
serialise per spoke (`publish-release-<source_repo>`).

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

# Full monolithic build (default).
npm run build

# Single-spoke build (matches the merge / release pipeline).
ONLY_SPOKE=genai BASE_URL=/genai/v1.2/ \
  SITE_URL=https://docs.example.com \
  npm run build
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor
workflow.
