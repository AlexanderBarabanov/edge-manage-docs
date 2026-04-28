import type * as Preset from '@docusaurus/preset-classic';
import type { Config, PluginConfig } from '@docusaurus/types';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { themes as prismThemes } from 'prism-react-renderer';
import { load as yamlLoad } from 'js-yaml';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

type SpokeConfig = {
  repo: string;
  ref: string;
  id: string;
  routeBasePath: string;
  /** Label shown in the navbar. Defaults to `id`. */
  label?: string;
  paths: string[];
};

type SpokesYml = {
  spokes: SpokeConfig[];
};

const REPO_ROOT = __dirname;
const SPOKES_DIR = 'spokes'; // Relative to REPO_ROOT; populated by scripts/clone-spokes.sh.

const allSpokes: SpokeConfig[] = (
  yamlLoad(readFileSync(path.join(REPO_ROOT, 'spokes.yml'), 'utf8')) as SpokesYml
).spokes;

// The build mode is derived purely from what's on disk under spokes/:
//
//   0 checkouts                          → hub-only build (top-level shell, no spokes;
//                                          src/pages/index.tsx + 404 + shared assets).
//   ≥1 checkouts, no `.single-spoke`     → multi-spoke build (hub root + each spoke under
//                                          its declared routeBasePath). Used for previews.
//   ≥1 checkouts, `.single-spoke` file   → single-spoke build (the spoke owns `/`, hub
//                                          root dropped). The marker is written by
//                                          clone-spokes.sh whenever its clone is
//                                          restricted (--only / ONLY_SPOKES) and removed
//                                          on every unrestricted run, so it's purely a
//                                          filesystem record of how the script was
//                                          invoked — no env-var coupling at build time.
//
// Used by:
//   publish-hub.yml      — does not run clone-spokes.sh                  → hub-only
//   publish-preview.yml  — preview: clones every spoke                   → multi-spoke
//   publish-preview.yml  — merge:   clone-spokes.sh --only=<spoke>        → single-spoke
//   publish-release.yml  — clone-spokes.sh --only=<spoke>                 → single-spoke
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
const spokes: SpokeConfig[] = allSpokes.filter((s) => {
  try {
    fs.statSync(path.join(REPO_ROOT, SPOKES_DIR, s.repo.split('/').pop()!));
    return true;
  } catch {
    return false;
  }
});
const isHubOnlyBuild = spokes.length === 0;
const isSingleSpokeBuild =
  spokes.length > 0 &&
  fs.existsSync(path.join(REPO_ROOT, SPOKES_DIR, '.single-spoke'));

// In single-spoke mode the spoke owns the entire site, so its docs and
// landing page are mounted at `/` rather than under their declared
// routeBasePath.
const effectiveRouteBasePath = (spoke: SpokeConfig): string =>
  isSingleSpokeBuild ? '/' : spoke.routeBasePath;

function spokeCheckoutDir(spoke: SpokeConfig): string {
  // Matches clone-spokes.sh: basename(repo) under spokes/.
  // Resolve symlinks so webpack's resolve.symlinks behaviour (which
  // normalises imported paths to their real path) still matches the
  // `include` list that plugins pass to the MDX loader.
  const relDir = path.join(SPOKES_DIR, spoke.repo.split('/').pop()!);
  const absDir = path.join(REPO_ROOT, relDir);
  try {
    return path.relative(REPO_ROOT, realpathSync(absDir));
  } catch {
    return relDir;
  }
}

function docsPluginId(spoke: SpokeConfig): string {
  // The first spoke is mounted via the classic preset (pluginId='default') so
  // theme features that default to pluginId="default" (404 page, search index,
  // etc.) have a docs instance to bind to.
  return spoke === spokes[0] ? 'default' : spoke.id;
}

function docsPluginOptions(spoke: SpokeConfig) {
  const spokeDir = spokeCheckoutDir(spoke);
  return {
    path: path.join(spokeDir, 'docs'),
    routeBasePath: effectiveRouteBasePath(spoke),
    sidebarPath: require.resolve('./sidebars/auto.ts'),
    editUrl: ({ docPath }: { docPath: string }) =>
      `https://github.com/${spoke.repo}/edit/${spoke.ref}/docs/${docPath}`,
    async sidebarItemsGenerator({ defaultSidebarItemsGenerator, ...args }: any) {
      const excludeCategories = args.item.customProps?.excludeCategories as
        | string[]
        | undefined;
      const items = await defaultSidebarItemsGenerator(args);
      return items.filter(
        (i: any) =>
          !(excludeCategories && i.type === 'category' && excludeCategories.includes(i.label)),
      );
    },
  };
}

function docsPlugin(spoke: SpokeConfig): PluginConfig {
  return [
    '@docusaurus/plugin-content-docs',
    { id: docsPluginId(spoke), ...docsPluginOptions(spoke) },
  ];
}

function landingPagePlugin(spoke: SpokeConfig): PluginConfig | null {
  // Optional landing page lives at `docs/_landing/` inside the spoke — the
  // leading underscore tells the docs plugin to ignore the folder, so a single
  // `docs/` tree holds both docs content and the landing page source.
  const landingDir = path.join(spokeCheckoutDir(spoke), 'docs', '_landing');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').statSync(path.join(REPO_ROOT, landingDir));
  } catch {
    return null;
  }
  return [
    '@docusaurus/plugin-content-pages',
    {
      id: `${spoke.id}-landing`,
      path: landingDir,
      routeBasePath: effectiveRouteBasePath(spoke),
    },
  ];
}

function samplesPlugin(spoke: SpokeConfig): PluginConfig | null {
  // Only wire the samples plugin for the GenAI spoke (it is GenAI-specific).
  if (spoke.id !== 'genai') return null;
  const spokeDir = spokeCheckoutDir(spoke);
  const base = effectiveRouteBasePath(spoke);
  const docsRouteBase = base === '/' ? '/samples' : `/${base}/samples`;
  return [
    require.resolve('./src/plugins/genai-samples-docs-plugin'),
    {
      // The spoke's `samples-list` component calls
      // `usePluginData('genai-samples-docs-plugin')`, which implicitly looks up
      // the 'default' instance id. Leave `id` unset so Docusaurus assigns it.
      samplesPath: path.join(spokeDir, 'samples'),
      docsOutPath: path.join(spokeDir, 'docs', 'samples'),
      readmeImportBase: `@site/${spokeDir}/samples`,
      githubBaseUrl: `https://github.com/${spoke.repo}/tree/${spoke.ref}/samples`,
      docsRouteBase,
    },
  ];
}

const [firstSpoke, ...otherSpokes] = spokes;

const spokePlugins: PluginConfig[] = [
  // The first spoke is wired via presets.classic.docs (below), so we only emit
  // docs plugins for additional spokes. In hub-only builds (no spoke
  // checkouts) `firstSpoke` is undefined and there's nothing to wire here.
  ...otherSpokes.map(docsPlugin),
  ...spokes.flatMap((spoke) =>
    [landingPagePlugin(spoke), samplesPlugin(spoke)].filter(
      (p): p is PluginConfig => p !== null,
    ),
  ),
];

const config: Config = {
  title: 'Edge Docs Hub',
  favicon: 'img/favicon.png',

  // Production URL of the site. Override per deployment via $SITE_URL —
  // preview builds (S3 + CloudFront) and GitHub Pages want different values.
  url: process.env.SITE_URL || 'https://open-edge-platform.github.io',
  // URL prefix under which the site is served. '/' for production;
  // '/pr/<N>/' for PR previews served as sub-paths.
  baseUrl: process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/?$/, '/')
    : '/',

  organizationName: 'open-edge-platform',
  projectName: 'edge-manage-docs',

  customFields: {
    // Exposed to client-side code (e.g. the hub landing page) via
    // useDocusaurusContext().
    spokes: spokes.map((s) => ({
      id: s.id,
      label: s.label ?? s.id,
      routeBasePath: s.routeBasePath,
      repo: s.repo,
    })),
  },

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        // In hub-only builds there are no spoke checkouts to mount docs from,
        // so we disable the classic preset's docs plugin entirely. The 404
        // page and other theme features that default to `pluginId="default"`
        // gracefully degrade when no docs plugin is registered.
        docs: isHubOnlyBuild ? false : docsPluginOptions(firstSpoke),
        blog: false,
        // In single-spoke builds the hub root landing (src/pages/index.tsx)
        // must not be emitted: the build is deployed under <bucket>/<spoke>/
        // (or .../<spoke>/<vX.Y>/) and `/` belongs to the spoke itself.
        pages: isSingleSpokeBuild ? false : undefined,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: spokePlugins,

  themes: [
    // The search theme's <SearchBar> hooks into the docs plugin's global
    // data. In hub-only builds there's no docs plugin, so we drop the
    // search theme entirely (the hub landing has no content to search).
    ...(isHubOnlyBuild
      ? []
      : ([
          [
            require.resolve('@easyops-cn/docusaurus-search-local'),
            {
              hashed: true,
              highlightSearchTermsOnTargetPage: true,
              searchBarShortcutHint: false,
            },
          ],
        ] as Config['themes'] & object[])),
  ],

  themeConfig: {
    colorMode: { disableSwitch: true, defaultMode: 'light' },
    navbar: {
      title: 'Edge Docs',
      logo: { alt: 'Intel logo', src: 'img/intel-logo.svg' },
      items: [
        // "Home" links back to the hub root. In multi-spoke / hub-only
        // builds the hub root is part of the same artifact, so a relative
        // `to: '/'` works. In single-spoke builds the artifact is deployed
        // under `<bucket>/<spoke>/<vX.Y>/` while the hub still lives at
        // `<bucket>/`, so we need a literal absolute `/` that doesn't get
        // prefixed with `baseUrl`. `autoAddBaseUrl: false` is forwarded
        // by the navbar to `<Link>`, which then emits `<a href="/">`.
        isSingleSpokeBuild
          ? {
              href: '/',
              prependBaseUrlToHref: false,
              autoAddBaseUrl: false,
              label: 'Home',
              position: 'left' as const,
            }
          : { to: '/', label: 'Home', position: 'left' as const },
        ...spokes.map((spoke) => ({
          type: 'docSidebar' as const,
          sidebarId: 'docs',
          docsPluginId: docsPluginId(spoke),
          position: 'left' as const,
          label: spoke.label ?? spoke.id,
        })),
      ],
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
