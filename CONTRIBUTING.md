# Documentation Website Convention

This documentation hub aggregates documentation from multiple repositories ("spokes") into a single Docusaurus site. Spokes provide content. The hub owns the framework, build pipeline, theme, and deployment.

# Spoke Repository

## Spoke Tiers

Spokes range from trivial (pure Markdown) to rich (landing page + generated docs from source). The hub does not require any particular tier — each feature is opt-in by the spoke's folder layout.

### Tier 1 — Markdown only

The minimum viable spoke: a single `docs/` directory with Markdown files.

```
your-repo/
└── docs/
    ├── getting-started/
    │   ├── _category_.json
    │   └── introduction.md
    └── guides/
        ├── _category_.json
        └── setup.md
```

Suitable when you only need text, code blocks, and images. No TSX, no generators.

### Tier 2 — MDX + colocated images

Add `.mdx` for interactive content (tabs, admonitions, shared components) and colocate images with the docs that use them.

```
your-repo/
└── docs/
    ├── concepts/
    │   ├── img/
    │   │   └── architecture.svg
    │   └── overview.mdx
    └── guides/
        └── setup.mdx
```

Suitable when you need admonitions, code tabs, and the hub's shared MDX components.

### Tier 3 — Custom colocated components

Place TSX components inside `docs/` in `_`-prefixed folders (the docs plugin ignores them as content but MDX can still import them).

```
your-repo/
└── docs/
    ├── _components/
    │   └── models-table/
    │       ├── index.tsx
    │       └── models.ts
    └── models/
        └── index.mdx   // import ModelsTable from '../_components/models-table';
```

Constraints on colocated components:
- Use **relative imports only** between spoke-local files.
- Import only from `@docusaurus/...`, `@theme/...`, `react`, and other packages resolvable from the hub's `node_modules`. Do not import from `@site/src/...` — that path resolves to the hub, not your repo.

### Tier 4 — Landing page

Add a landing page served at the spoke's root URL (e.g. `/genai/`) by placing a `docs/_landing/` folder with an `index.tsx`. Anything under `_landing/` is ignored by the docs plugin and picked up by a `plugin-content-pages` instance the hub wires up automatically.

```
your-repo/
└── docs/
    ├── _landing/
    │   ├── index.tsx            // → /<routeBasePath>/
    │   ├── index.module.css
    │   ├── img/
    │   │   └── hero.svg
    │   └── _sections/
    │       ├── HeroSection/
    │       └── FeaturesSection/
    ├── getting-started/
    │   └── introduction.mdx
    └── guides/
```

Link from the landing to docs with relative paths (`getting-started/introduction`) so the spoke works regardless of the hub's `routeBasePath`.

### Tier 5 — Generated docs (samples plugin)

For spokes that want to surface source-code samples as browsable docs, the hub provides a "samples" plugin (currently GenAI-specific). It discovers `samples/<language>/<sample>/` subtrees in the spoke and writes MDX into `docs/samples/` at build time. The generated files are ignored by git in the spoke.

```
your-repo/
├── .gitignore                 // /docs/samples/{c,cpp,js,python}/
├── docs/
│   ├── _landing/
│   ├── samples/
│   │   ├── index.mdx          // hand-written; renders a list of samples
│   │   ├── _components/
│   │   │   └── samples-list/  // consumes the plugin's global data
│   │   ├── c/                 // ← generated at build time, gitignored
│   │   ├── cpp/
│   │   ├── js/
│   │   └── python/
│   └── use-cases/
└── samples/
    ├── c/
    │   └── text_generation/
    │       ├── README.md
    │       └── main.c
    ├── cpp/
    ├── js/
    └── python/
```

The plugin uses each sample's `README.md` (if present) as the page body and emits a `docLink` per sample so spoke components can link to the generated pages.

## Conventions (apply to all tiers)

### Sidebar ordering

The sidebar is auto-generated from the filesystem. Control it with:

**`_category_.json`** — per directory:
```json
{
  "label": "Getting Started",
  "position": 1,
  "link": { "type": "generated-index" }
}
```

**Frontmatter** — per document:
```yaml
---
sidebar_position: 2
sidebar_label: Installation
---
```

No `sidebars.ts` is supported in spoke repos.

### Links between docs

Use **relative paths** between Markdown files:

```markdown
See the [installation guide](../getting-started/installation.md).
```

Avoid absolute URL paths (`/genai/...`) — they hard-code the hub's `routeBasePath`. The only place absolute paths are needed is inside TSX components that must work from any URL depth; in that case the hub passes them in via plugin data (see the samples plugin's `docLink`).

### Images

Colocate images next to the MDX that references them and use relative paths. Avoid a top-level `static/` folder — that conflicts with the hub's static assets.

### Shared MDX components (provided by the hub)

Available globally in MDX without an import:

| Component | Purpose |
|---|---|
| `Button` | Styled link button |
| `LanguageTabs` | Tab group container |
| `TabItemPython`, `TabItemCpp`, `TabItemJS`, `TabItemC` | Tab items for `LanguageTabs` |
| `OptimumCLI` | Optimum CLI command generator |

### Git LFS

If your repo stores images via LFS, keep them in LFS — the hub's clone script fetches the required objects. If your repo does not use LFS, nothing to do.

### What not to include

| Don't commit | Why |
|---|---|
| `docusaurus.config.ts`, `package.json` | Hub owns the framework |
| `sidebars.ts` | Sidebar is auto-generated |
| `src/pages/`, `src/theme/`, `src/css/` | Hub owns the shell |
| Generated files (e.g. `docs/samples/{c,cpp,js,python}/`) | Generated by the hub at build time |
| Top-level `static/` folder | Colocate assets with docs instead |

# Adding a Spoke to the Hub

Spokes are registered in [`spokes.yml`](./spokes.yml). Adding one is a 1–2 step process depending on whether the spoke needs generator plugins.

## 1. Register in `spokes.yml`

```yaml
spokes:
  - repo: owner/my-project           # GitHub repo (<owner>/<name>)
    ref: main                        # branch, tag, or SHA
    id: my-project                   # unique; used as docs plugin instance id
    routeBasePath: my-project        # URL prefix → /my-project/
    label: My Project                # navbar label
    paths:                           # sparse-checkout list
      - docs/
```

| Field | Required | Purpose |
|---|---|---|
| `repo` | yes | GitHub `<owner>/<name>`. |
| `ref` | yes | Branch, tag, or full SHA to clone. |
| `id` | yes | Docs-plugin instance id. Must be unique across all spokes. The first spoke in the list is mounted as the default instance. |
| `routeBasePath` | yes | URL path under which the spoke's docs (and landing, if any) are served. |
| `label` | yes | Text for the navbar entry. |
| `paths` | yes | Sparse-checkout paths. At minimum `docs/`. Add `samples/` if you use the samples plugin. |

That's it for Tier 1–4 spokes. `npm run build` clones, builds, and serves them.

## 2. Opt in to the samples plugin (Tier 5 only)

The samples plugin is currently GenAI-specific and gated in [`docusaurus.config.ts`](./docusaurus.config.ts) by `spoke.id === 'genai'`. If a new spoke needs it, either:

- Reuse the existing plugin: generalise the guard (`spoke.paths.includes('samples/')`) and ensure your spoke provides a `docs/samples/index.mdx` + a list component consuming the plugin's global data.
- Add a dedicated plugin under `src/plugins/` for your generator, register it in `docusaurus.config.ts`, and wire an npm script into `gen-samples` (or a new `prebuild` step).

Generated files must be gitignored in the spoke.

## 3. Local development loop

Instead of re-cloning on every change, point the hub at a local working copy:

```bash
./scripts/clone-spokes.sh --use-local=owner/my-project:/abs/path/to/checkout
npm run gen-samples    # only if your spoke uses the samples plugin
npx docusaurus start
```

The `--use-local` flag can be passed multiple times. It symlinks `spokes/<name>` at the given path and skips git/LFS entirely.

## 4. PR preview of a spoke branch

To build the hub against a specific spoke branch without editing `spokes.yml`:

```bash
./scripts/clone-spokes.sh --override-repo=owner/my-project --override-ref=my-pr-branch
npm run build
```

## Build and serve

From the hub repo:

```bash
npm install             # once
npm run build           # prebuild (clone + gen-samples) + docusaurus build
npm run serve           # serve build/ at http://localhost:3000/
# or
npm start               # prebuild + docusaurus start (hot reload)
```

Requirements: Node 22, `git`, and `git-lfs` if any spoke uses LFS.
