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

const spokes: SpokeConfig[] = (
  yamlLoad(readFileSync(path.join(REPO_ROOT, 'spokes.yml'), 'utf8')) as SpokesYml
).spokes;

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
    routeBasePath: spoke.routeBasePath,
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
      routeBasePath: spoke.routeBasePath,
    },
  ];
}

function samplesPlugin(spoke: SpokeConfig): PluginConfig | null {
  // Only wire the samples plugin for the GenAI spoke (it is GenAI-specific).
  if (spoke.id !== 'genai') return null;
  const spokeDir = spokeCheckoutDir(spoke);
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
      docsRouteBase: `/${spoke.routeBasePath}/samples`,
    },
  ];
}

const [firstSpoke, ...otherSpokes] = spokes;

const spokePlugins: PluginConfig[] = [
  // The first spoke is wired via presets.classic.docs (below), so we only emit
  // docs plugins for additional spokes.
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
        docs: docsPluginOptions(firstSpoke),
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: spokePlugins,

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: false,
      },
    ],
  ],

  themeConfig: {
    colorMode: { disableSwitch: true, defaultMode: 'light' },
    navbar: {
      title: 'Edge Docs',
      logo: { alt: 'Intel logo', src: 'img/intel-logo.svg' },
      items: [
        { to: '/', label: 'Home', position: 'left' },
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
