# Contributing

## Spoke content structure

Features are opt-in by folder layout. All tiers start with `docs/`.

### Markdown only

```
your-repo/
└── docs/
    ├── getting-started/
    │   ├── _category_.json
    │   └── introduction.md
    └── guides/
        └── setup.md
```

### MDX + colocated images

```
docs/
└── concepts/
    ├── img/
    │   └── architecture.svg
    └── overview.mdx
```

### Custom TSX components

Place components in `_`-prefixed folders — the docs plugin ignores them as content, but MDX can import them:

```
docs/
├── _components/
│   └── models-table/
│       └── index.tsx
└── models/
    └── index.mdx   // import ModelsTable from '../_components/models-table';
```

Constraints: relative imports only; import from `@docusaurus/...`, `@theme/...`, `react` — not `@site/src/...`.

### Landing page

`docs/_landing/index.tsx` is served at `/<routeBasePath>/`. Link to docs with relative paths.

```
docs/
├── _landing/
│   ├── index.tsx
│   └── index.module.css
└── getting-started/
    └── introduction.mdx
```

### Generated docs (samples plugin)

Currently GenAI-specific. Add `samples/` to your spoke's `paths` in `spokes.yml` and see `src/plugins/` + `docusaurus.config.ts`.

## Conventions

**Sidebar** — auto-generated from the filesystem. Use `_category_.json` per directory and `sidebar_position` frontmatter per file. No `sidebars.ts`.

**Links** — relative paths between Markdown files (`../guides/setup.md`). Avoid absolute paths (`/genai/...`) — they break if `routeBasePath` changes.

**Images** — colocate next to the MDX that references them. No top-level `static/`.

**Shared MDX components** (available without import):

| Component | Purpose |
|---|---|
| `Button` | Styled link button |
| `LanguageTabs` | Tab group container |
| `TabItemPython`, `TabItemCpp`, `TabItemJS`, `TabItemC` | Language tab items |
| `OptimumCLI` | CLI command generator |

**Don't commit:** `docusaurus.config.ts`, `package.json`, `sidebars.ts`, `src/pages/`, `src/theme/`, `src/css/`, top-level `static/`, build-generated files.

## Adding a spoke

1. Add to `spokes.yml`:

```yaml
spokes:
  - repo: owner/your-repo
    ref: main
    id: your-repo          # unique; first entry = default docs plugin instance
    routeBasePath: your-repo
    label: Your Project
    paths:
      - docs/
      # - docs-versions/   # add if the spoke uses versioning
      # - samples/         # add if the spoke uses the samples plugin
```

2. Add the dispatch trigger to your repo's CI (one-line reusable workflow call).

3. Test locally:

```sh
./scripts/clone-spokes.sh --use-local=owner/your-repo:/abs/path/to/checkout
BUILD_ALL_SPOKES=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build
npm run serve
```

## Local development

```sh
npm install

# Build everything
BUILD_ALL_SPOKES=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build

# Build one spoke only (root "/" redirects to it, so `npm run serve` lands on it)
SPOKE=openvino SITE_URL=https://docs.example.com npm run build

# Build against a specific branch or commit (without editing spokes.yml)
./scripts/clone-spokes.sh --override=owner/your-repo:my-branch
BUILD_ALL_SPOKES=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build

npm run serve       # serve build/ at localhost:3000
npm start           # hot-reload dev server (BUILD_ALL_SPOKES=1 required)
```

Exactly one build mode env var must be set (`BUILD_ALL_SPOKES`, `SPOKE`, or `ROOT_REDIRECT`) or the build aborts.

A local `SPOKE=<id>` build nests the spoke under `/<rbp>/` (baseUrl `/`) and
adds a `/` → `/<rbp>/` redirect, so opening `localhost:3000/` lands on the
spoke. In CI (`CI=true`) the same `SPOKE=<id>` command instead produces the
production per-spoke artifact rooted at `/<rbp>/`. Set `CI=1` locally to
reproduce that exact artifact.

Requirements: Node 22, `git`, `git-lfs` (if any spoke uses LFS).

## Site root redirect

There is no standalone hub landing page. The site root (`/`) is a single
generated `index.html` that immediately redirects to one spoke's landing page.
Which spoke that is comes from the top-level `rootRedirectSpoke` key in
[`spokes.yml`](spokes.yml):

```yaml
rootRedirectSpoke: openvino   # / → /openvino/

spokes:
  - id: openvino
    routeBasePath: openvino
    # ...
```

How it works:

- `rootRedirectSpoke` must equal one of the `spokes[].id` values. The build
  looks that id up and uses the spoke's `routeBasePath` as the redirect target,
  so `rootRedirectSpoke: openvino` makes `/` forward to `/openvino/`.
- The redirect target is **base-URL-relative**, so it follows whatever prefix
  the bundle is deployed under: `/openvino/` in production, `/pr/hub/<N>/openvino/`
  in a preview.
- The root `index.html` is emitted only by builds that own `/` — `ROOT_REDIRECT`
  (root only), `BUILD_ALL_SPOKES` (root + every spoke), and local single-spoke
  builds (`SPOKE=<id>` without `CI`, which redirect `/` to that one spoke). The
  production per-spoke build (`CI=true SPOKE=<id>`) is rooted at `/<rbp>/` and
  never writes `/`, so `rootRedirectSpoke` is ignored there.
- Because root-owning builds require it, an empty or unknown `rootRedirectSpoke`
  aborts the build with a clear error. To change the landing product, point the
  key at a different spoke id — no code change needed.

## How the dispatch flow works

Spoke CI dispatches `deploy-preview` to the hub with `{ repo, branch, pr_number, sha }`.

**Preview mode** (branch ≠ main/master):
1. Hub validates sender and payload.
2. Builds the root redirect (`ROOT_REDIRECT`) + the triggering spoke (`SPOKE=<id>`), each with `BASE_URL=/pr/<spoke>/<PR#>/[<rbp>/]`.
3. Deploys both to `pr/<spoke>/<PR#>/`.
4. Posts a preview link as a PR comment; updates it on each push.

**Merge mode** (branch = main/master):
1. Hub builds the spoke (`SPOKE=<id>`) at its `routeBasePath`.
2. Deploys to `/<rbp>/`.

**Close:** spoke CI dispatches `close-preview`; hub deletes `pr/<spoke>/<PR#>/`.

**Hub PR preview:** triggered by the `deploy-doc-preview` label on a hub repo PR. Builds hub first, then all spokes in parallel, deploys to `pr/hub/<PR#>/`. Cleaned up when the PR closes.
