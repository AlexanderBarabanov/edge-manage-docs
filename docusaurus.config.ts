import path from 'path';
import fs from 'fs';

import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// ---------------------------------------------------------------------------
// Spoke discovery — reads spokes.yml and each spoke's docs.manifest.json
// ---------------------------------------------------------------------------

type SpokeManifest = {
  id: string;
  label: string;
  docsPath: string;
  routeBasePath?: string;
  plugins?: string[];
  excludeSidebarCategories?: string[];
  _dirName: string; // directory name under spokes/
};

function discoverSpokes(): SpokeManifest[] {
  const spokesDir = path.resolve(__dirname, 'spokes');
  if (!fs.existsSync(spokesDir)) {
    return [];
  }

  const manifests: SpokeManifest[] = [];
  for (const entry of fs.readdirSync(spokesDir)) {
    const manifestPath = path.join(spokesDir, entry, 'docs.manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf8')
      ) as SpokeManifest;
      manifest._dirName = entry;
      manifests.push(manifest);
    }
  }
  return manifests;
}

const spokes = discoverSpokes();

// ---------------------------------------------------------------------------
// Docusaurus config
// ---------------------------------------------------------------------------

const config: Config = {
  title: 'Edge AI Documentation',
  favicon: 'img/favicon.png',

  url: 'https://edge-platform-docs.intel.com',
  baseUrl: '/',

  onBrokenLinks: 'warn',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        // Use the first spoke as the default docs instance.
        // Additional spokes are registered as separate plugin-content-docs below.
        docs: spokes[0]
          ? {
              path: path.join('spokes', spokes[0]._dirName, spokes[0].docsPath),
              routeBasePath: spokes[0].routeBasePath ?? spokes[0].id,
              sidebarPath: false,
            }
          : false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // Resolve @site/docs/... to the correct spoke's docs directory based on
    // which spoke the importing file belongs to.
    function spokeDocsResolverPlugin() {
      const spokesDir = path.resolve(__dirname, 'spokes');
      return {
        name: 'spoke-docs-resolver',
        configureWebpack() {
          return {
            resolve: {
              plugins: [
                {
                  apply(resolver: {
                    getHook: (name: string) => {
                      tapAsync: (
                        name: string,
                        cb: (
                          request: { request?: string; context?: { issuer?: string } },
                          resolveContext: unknown,
                          callback: () => void,
                        ) => void,
                      ) => void;
                    };
                  }) {
                    resolver
                      .getHook('described-resolve')
                      .tapAsync('SpokeDocsResolver', (request, _ctx, callback) => {
                        const req = request.request;
                        if (!req || !req.startsWith('@site/docs/')) return callback();

                        const issuer = request.context?.issuer ?? '';
                        // Find which spoke the importing file belongs to
                        for (const spoke of spokes) {
                          const spokeDir = path.resolve(
                            spokesDir,
                            spoke._dirName,
                            spoke.docsPath,
                          );
                          if (issuer.startsWith(spokeDir)) {
                            request.request = req.replace(
                              '@site/docs',
                              spokeDir,
                            );
                            return callback();
                          }
                        }
                        return callback();
                      });
                  },
                },
              ],
            },
          };
        },
      };
    },

    // Custom plugins declared by spokes (loaded before docs so they can
    // generate files that plugin-content-docs will discover).
    ...spokes.flatMap((spoke) => {
      if (!spoke.plugins?.length) return [];
      const spokeRoot = path.join('spokes', spoke._dirName);
      return spoke.plugins.map((pluginRel) => {
        const pluginPath = path.resolve(spokeRoot, spoke.docsPath, pluginRel);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pluginFn = require(pluginPath).default ?? require(pluginPath);
        return [pluginFn, { spokeRoot }] as const;
      });
    }),

    // Additional spoke docs instances (first spoke is handled by the preset above)
    ...spokes.slice(1).map((spoke) => {
      const excludeCategories = spoke.excludeSidebarCategories ?? [];
      return [
        '@docusaurus/plugin-content-docs',
        {
          id: spoke.id,
          path: path.join('spokes', spoke._dirName, spoke.docsPath),
          routeBasePath: spoke.routeBasePath ?? spoke.id,
          async sidebarItemsGenerator({
            defaultSidebarItemsGenerator,
            ...args
          }: {
            defaultSidebarItemsGenerator: (...a: unknown[]) => Promise<unknown[]>;
            [key: string]: unknown;
          }) {
            const sidebarItems = await defaultSidebarItemsGenerator(args);
            if (excludeCategories.length === 0) {
              return sidebarItems;
            }
            return (sidebarItems as { type?: string; label?: string }[]).filter(
              (item) => {
                if (item.type === 'category') {
                  return !excludeCategories.includes(item.label ?? '');
                }
                return true;
              }
            );
          },
        },
      ] as const;
    }),
  ],

  themeConfig: {
    colorMode: {
      disableSwitch: true,
      defaultMode: 'light',
    },

    navbar: {
      title: 'Edge AI Docs',
      logo: {
        alt: 'Intel logo',
        src: 'img/intel-logo.svg',
      },
      items: [
        // Dynamic spoke nav items
        ...spokes.map((spoke) => ({
          to: `/${spoke.routeBasePath ?? spoke.id}/`,
          label: spoke.label,
          position: 'left' as const,
        })),
        {
          href: 'https://github.com/openvinotoolkit',
          label: 'GitHub',
          position: 'right' as const,
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'OpenVINO',
          items: [
            {
              label: 'OpenVINO™ Documentation',
              href: 'https://docs.openvino.ai/',
            },
            {
              label: 'Case Studies',
              href: 'https://www.intel.com/content/www/us/en/internet-of-things/ai-in-production/success-stories.html',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'Terms of Use',
              href: 'https://docs.openvino.ai/2026/about-openvino/additional-resources/terms-of-use.html',
            },
            {
              label: 'Responsible AI',
              href: 'https://www.intel.com/content/www/us/en/artificial-intelligence/responsible-ai.html',
            },
          ],
        },
        {
          title: 'Privacy',
          items: [
            {
              label: 'Cookies',
              href: 'https://www.intel.com/content/www/us/en/privacy/intel-cookie-notice.html',
            },
            {
              label: 'Privacy',
              href: 'https://www.intel.com/content/www/us/en/privacy/intel-privacy-notice.html',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Intel Corporation
                Intel, the Intel logo, and other Intel marks are trademarks of Intel Corporation or its subsidiaries.
                Other names and brands may be claimed as the property of others.`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: false,
        indexDocs: true,
        indexBlog: false,
        docsRouteBasePath: spokes.map((s) => s.routeBasePath ?? s.id),
        docsDir: spokes.map((s) => path.join('spokes', s._dirName, s.docsPath)),
      },
    ],
  ],
};

export default config;
