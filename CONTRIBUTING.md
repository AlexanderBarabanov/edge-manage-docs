# Documentation Website Convention

This documentation hub aggregates documentation from multiple repositories ("spokes") into a single Docusaurus site. Spokes provide content. The hub owns the framework, build pipeline, theme, and deployment.

# Spoke Repository

## Repository Structure

A spoke repository must have a `docs/` directory at its root containing the documentation content. No Docusaurus configuration, no `package.json`, no framework code.

```
your-repo/
├── docs/
│   ├── getting-started/
│   │   ├── _category_.json
│   │   ├── img/
│   │   │   └── diagram.svg
│   │   └── introduction.md
│   ├── guides/
│   │   ├── _category_.json
│   │   └── setup.mdx
│   └── reference/
│       ├── _category_.json
│       └── api.md
└── docs.manifest.json
```

## Content Format

### Markdown and MDX

Write documentation in `.md` (plain Markdown) or `.mdx` (Markdown with JSX support). Both are supported.

Spokes that only need text, code blocks, and images should use `.md`. Spokes that need interactive components (tabs, custom widgets) can use `.mdx` and bring their own TSX components or use shared components provided by the hub.

### Sidebar Ordering

Sidebar structure is auto-generated from the filesystem. Control ordering with:

**`_category_.json`** — placed in each directory to define its label and position:

```json
{
  "label": "Getting Started",
  "position": 1,
  "link": {
    "type": "generated-index",
    "description": "Getting started with the product."
  }
}
```

**Frontmatter** — in individual documents to control their position within a category:

```yaml
---
sidebar_position: 2
sidebar_label: Installation
---
```

No `sidebars.ts` or `sidebars.json` file is needed or supported in spoke repos.

### Images

Colocate images with the documents that reference them. Place images in an `img/` subdirectory next to the Markdown file:

```
docs/concepts/
├── img/
│   ├── architecture.svg
│   └── workflow.png
├── overview.md          → ![Architecture](./img/architecture.svg)
└── details.md           → ![Workflow](./img/workflow.png)
```

Use **relative paths only**. Absolute paths (`/img/...`) resolve against the hub's static directory and will break.

### Internal Links

Link between documents using relative paths:

```markdown
See the [installation guide](../getting-started/installation.md) for details.
```

Do not use absolute URL paths — they depend on the hub's routing configuration and may change.

## Advanced: Custom Components in MDX

Spokes can include React (TSX) components colocated in their `docs/` directory. This is optional — most spokes won't need it.

### Shared Components

The hub provides globally available components that any spoke can use in MDX without imports:

| Component | Purpose |
|---|---|
| `Button` | Styled link button |
| `LanguageTabs` | Tab group with Python / C++ / JavaScript tabs |
| `TabItemPython`, `TabItemCpp`, `TabItemJS` | Tab items for `LanguageTabs` |
| `OptimumCLI` | Generates Optimum CLI export commands from props |

Usage (no `import` statement needed):

```mdx
<LanguageTabs>
<TabItemPython>

```python
print("hello")
```

</TabItemPython>
<TabItemCpp>

```cpp
std::cout << "hello";
```

</TabItemCpp>
</LanguageTabs>
```

### Colocated Components

Spokes that need custom rendering (tables, interactive widgets) can place TSX files inside `docs/`:

```
docs/models/
├── _components/
│   └── models-table/
│       ├── index.tsx
│       └── models.ts
└── index.mdx   → import ModelsTable from './_components/models-table';
```

Constraints on colocated components:
- Use **relative imports only** between colocated files
- Use only `@docusaurus/Link`, `@theme/Heading`, and other Docusaurus built-in packages
- **Do not** import from `@site/src/...` — that path resolves to the hub, not your repo

## `docs.manifest.json`

Every spoke repository must have a `docs.manifest.json` at its root.

### Required Fields

```json
{
  "id": "my-project",
  "label": "My Project",
  "docsPath": "docs"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Lowercase, hyphens only (`^[a-z0-9-]+$`). Used in URLs and build paths. |
| `label` | string | Display name shown in navigation. |
| `docsPath` | string | Path to docs directory relative to repo root. |

### Optional Fields

```json
{
  "id": "my-project",
  "label": "My Project",
  "docsPath": "docs",
  "routeBasePath": "my-project",
  "requiredSharedComponents": ["Button", "LanguageTabs"],
  "preBuild": {
    "type": "generate-samples",
    "samplesPath": "samples"
  },
  "sparseCheckoutPaths": ["docs/", "samples/", "docs.manifest.json"],
  "excludeSidebarCategories": ["Internal"]
}
```

| Field | Type | Description |
|---|---|---|
| `routeBasePath` | string | URL prefix for docs. Defaults to `id`. |
| `requiredSharedComponents` | string[] | Hub-provided components your MDX uses. Build fails if any are missing — catches breakage early. |
| `preBuild` | object | Content generation hook. The hub runs this before building. Generated output goes to a temporary build directory, never committed. |
| `sparseCheckoutPaths` | string[] | Paths to clone. Omit for full clone. Reduces CI time for large repos. |
| `excludeSidebarCategories` | string[] | Category labels to hide from the sidebar. |

## Connecting to the Hub

To register your spoke:

1. Add `docs/` directory and `docs.manifest.json` to your repository
2. Request a hub maintainer to add your spoke to `spokes.yml` in the hub repo
3. For PR previews: add the `trigger-doc-preview.yml` workflow to your repo (template provided by hub maintainers)

## PR Previews

Spoke repositories can trigger documentation preview builds by dispatching a `repository_dispatch` event to the hub. The hub builds the full site with your PR's changes and posts a preview URL as a comment on your PR. See hub maintainers for the workflow template and required secrets.

## What Not to Include

| Don't include | Reason |
|---|---|
| `docusaurus.config.ts`, `package.json` | Hub owns the framework |
| `sidebars.ts` / `sidebars.json` | Sidebar is auto-generated |
| `src/` with pages, theme, CSS | Hub owns the theme and layout |
| Generated files | Hub generates at build time; nothing generated should be committed |
| Images in a top-level `static/` folder | Colocate with docs instead |
