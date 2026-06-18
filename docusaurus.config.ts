import type * as Preset from "@docusaurus/preset-classic";
import type { Config, PluginConfig } from "@docusaurus/types";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { themes as prismThemes } from "prism-react-renderer";
import { load as yamlLoad } from "js-yaml";
import { SPOKE_CATALOG } from "./src/hub-catalog";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

type SpokeConfig = {
  repo: string;
  ref: string;
  id: string;
  routeBasePath: string;
  paths: string[];
};

type SpokesYml = {
  spokes: SpokeConfig[];
};

const REPO_ROOT = __dirname;
const SPOKES_DIR = "spokes";

const allSpokes: SpokeConfig[] = (
  yamlLoad(
    readFileSync(path.join(REPO_ROOT, "spokes.yml"), "utf8"),
  ) as SpokesYml
).spokes;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");

// Exactly one of these three modes must be selected. No defaults, no fallbacks.
// Each mode emits a single self-contained Docusaurus bundle whose webpack
// `publicPath` is set by `baseUrl` below — so its assets live entirely under
// that prefix and never collide with bundles deployed at sibling prefixes:
//   HUB_ONLY=1         → hub landing only (src/pages/), baseUrl = /.
//   BUILD_ALL_SPOKES=1 → hub + every spoke (used by previews),
//                         baseUrl from $BASE_URL (e.g. /pr/<id>/<N>/).
//   SPOKE=<id>         → that spoke alone, baseUrl = /<rbp>/.
//
// Versioning is handled by Docusaurus' standard multi-version docs plugin.
// Each spoke owns its own `docs-versions/` (versions.json + versioned_docs/
// + versioned_sidebars/) which clone-spokes.sh symlinks into hub root with
// the appropriate `<id>_` prefix per plugin instance.
const HUB_ONLY = process.env.HUB_ONLY === "1";
const BUILD_ALL_SPOKES = process.env.BUILD_ALL_SPOKES === "1";
const SPOKE = (process.env.SPOKE ?? "").trim();

// Site origin (no trailing slash). Used for the canonical site URL and for
// cross-bundle navbar links (those need an absolute URL so Docusaurus treats
// them as external and skips baseUrl prefixing).
const SITE_URL = (process.env.SITE_URL ?? "").trim();
if (!SITE_URL) {
  throw new Error("SITE_URL must be set (e.g. https://docs.example.com).");
}
const SITE_ORIGIN = SITE_URL.replace(/\/+$/, "");

const modesSet = [HUB_ONLY, BUILD_ALL_SPOKES, !!SPOKE].filter(Boolean).length;
if (modesSet !== 1) {
  throw new Error(
    "Exactly one build mode must be set: HUB_ONLY=1, BUILD_ALL_SPOKES=1, or SPOKE=<id>.",
  );
}
const SPOKE_MODE = !!SPOKE;
const selectedSpoke = SPOKE_MODE
  ? allSpokes.find((s) => s.id === SPOKE)
  : undefined;
if (SPOKE_MODE && !selectedSpoke) {
  throw new Error(`SPOKE='${SPOKE}' not found in spokes.yml.`);
}

// Resolved baseUrl for this build. Reused by navbar links so cross-bundle
// hrefs include the correct prefix (e.g. /pr/<id>/<N>/<rbp>/ in previews).
const BASE_URL: string = SPOKE_MODE
  ? process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/?$/, "/")
    : `/${selectedSpoke!.routeBasePath}/`
  : process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/?$/, "/")
    : "/";

// The URL prefix every sibling bundle is deployed under. In hub/all builds
// that is just baseUrl. In a SPOKE build baseUrl already ends with the
// spoke's own routeBasePath (e.g. /pr/hub/44/genai/), so strip that trailing
// segment to recover the shared root (/pr/hub/44/) — or "/" in production.
const SPOKES_ROOT = SPOKE_MODE
  ? BASE_URL.replace(new RegExp(`${selectedSpoke!.routeBasePath}/$`), "")
  : BASE_URL;

const spokes: SpokeConfig[] = HUB_ONLY
  ? []
  : BUILD_ALL_SPOKES
    ? allSpokes
    : [selectedSpoke!];

for (const s of spokes) {
  const dir = path.join(REPO_ROOT, SPOKES_DIR, s.repo.split("/").pop()!);
  if (!fs.existsSync(dir)) {
    throw new Error(`Spoke '${s.id}' (${s.repo}) not checked out at ${dir}.`);
  }
}

// In SPOKE mode the entire bundle is rooted at /<rbp>/[<v>/], so the spoke's
// landing sits at routeBasePath '/'. In BUILD_ALL_SPOKES mode each spoke's
// landing mounts at its own <rbp> within a single hub bundle.
const effectiveRouteBasePath = (spoke: SpokeConfig): string =>
  SPOKE_MODE ? "/" : spoke.routeBasePath;

// Docs are served one segment below the spoke's landing, under `<rbp>/docs`
// (or `/docs` in SPOKE mode). Keeping docs on a dedicated `/docs/` segment lets
// the navbar tell a product landing (e.g. /genai/) apart from its docs
// (/genai/docs/...) with pure prefix matching, and removes the /<rbp>/
// landing-vs-docs route collision (e.g. PhysicalAI's docs index.md).
const docsRouteBasePath = (spoke: SpokeConfig): string =>
  SPOKE_MODE ? "docs" : `${spoke.routeBasePath}/docs`;

function spokeCheckoutDir(spoke: SpokeConfig): string {
  // Matches clone-spokes.sh: basename(repo) under spokes/.
  // Resolve symlinks so webpack's resolve.symlinks behaviour (which
  // normalises imported paths to their real path) still matches the
  // `include` list that plugins pass to the MDX loader.
  const relDir = path.join(SPOKES_DIR, spoke.repo.split("/").pop()!);
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
  return spoke === spokes[0] ? "default" : spoke.id;
}

function docsPluginOptions(spoke: SpokeConfig) {
  const spokeDir = spokeCheckoutDir(spoke);
  return {
    path: path.join(spokeDir, "docs"),
    routeBasePath: docsRouteBasePath(spoke),
    sidebarPath: require.resolve("./sidebars/auto.ts"),
    editUrl: ({ docPath }: { docPath: string }) =>
      `https://github.com/${spoke.repo}/edit/${spoke.ref}/docs/${docPath}`,
    async sidebarItemsGenerator({
      defaultSidebarItemsGenerator,
      ...args
    }: any) {
      const excludeCategories = args.item.customProps?.excludeCategories as
        | string[]
        | undefined;
      const items = await defaultSidebarItemsGenerator(args);
      return items.filter(
        (i: any) =>
          !(
            excludeCategories &&
            i.type === "category" &&
            excludeCategories.includes(i.label)
          ),
      );
    },
  };
}

function docsPlugin(spoke: SpokeConfig): PluginConfig {
  return [
    "@docusaurus/plugin-content-docs",
    { id: docsPluginId(spoke), ...docsPluginOptions(spoke) },
  ];
}

function spokeHasLandingPage(spoke: SpokeConfig): boolean {
  const landingDir = path.join(spokeCheckoutDir(spoke), "docs", "_landing");
  return fs.existsSync(path.join(REPO_ROOT, landingDir));
}

function landingPagePlugin(spoke: SpokeConfig): PluginConfig | null {
  // Optional landing page lives at `docs/_landing/` inside the spoke — the
  // leading underscore tells the docs plugin to ignore the folder, so a single
  // `docs/` tree holds both docs content and the landing page source.
  if (!spokeHasLandingPage(spoke)) return null;

  const landingDir = path.join(spokeCheckoutDir(spoke), "docs", "_landing");
  return [
    "@docusaurus/plugin-content-pages",
    {
      id: `${spoke.id}-landing`,
      path: landingDir,
      routeBasePath: effectiveRouteBasePath(spoke),
    },
  ];
}

function samplesPlugin(spoke: SpokeConfig): PluginConfig | null {
  // Only wire the samples plugin for the GenAI spoke (it is GenAI-specific).
  if (spoke.id !== "genai") return null;
  const spokeDir = spokeCheckoutDir(spoke);
  // Samples are generated into `docs/samples`, so they ride along with the
  // docs plugin's routeBasePath. In SPOKE mode the spoke owns '/', so samples
  // live at '/docs/samples'; in BUILD_ALL_SPOKES at '/<rbp>/docs/samples'.
  const docsRouteBase = SPOKE_MODE
    ? "/docs/samples"
    : `/${spoke.routeBasePath}/docs/samples`;
  return [
    require.resolve("./src/plugins/genai-samples-docs-plugin"),
    {
      // The spoke's `samples-list` component calls
      // `usePluginData('genai-samples-docs-plugin')`, which implicitly looks up
      // the 'default' instance id. Leave `id` unset so Docusaurus assigns it.
      samplesPath: path.join(spokeDir, "samples"),
      docsOutPath: path.join(spokeDir, "docs", "samples"),
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

// Root (`/`) redirect behaviour:
//   BUILD_ALL_SPOKES + OpenVINO has _landing  → / redirects to /<rbp>/ (the
//     route where plugin-content-pages serves docs/_landing content).
//   BUILD_ALL_SPOKES + OpenVINO has no landing → /openvino/ redirects to
//     /openvino/docs/ so the bare spoke path never 404s.
//   SPOKE_MODE + spoke has _landing           → landing is already mounted at
//     / by landingPagePlugin; no redirect needed.
//   SPOKE_MODE + spoke has no _landing        → / redirects to /docs/ so root
//     never 404s.
//   HUB_ONLY                                  → no docs/spokes built; src/pages
//     serves the hub; no redirect needed.
// `from`/`to` values are baseUrl-relative — the plugin writes the redirect file
// under outDir/<from> and prepends baseUrl to <to>.
const openvinoSpoke = spokes.find(({ id }) => id === "openvino");
const openvinoHasLanding =
  openvinoSpoke !== undefined && spokeHasLandingPage(openvinoSpoke);

// In BUILD_ALL_SPOKES, redirect hub root to the OpenVINO spoke landing.
// Disabling hub pages (below) removes the conflicting root route so
// plugin-client-redirects can write build/index.html.
if (BUILD_ALL_SPOKES && openvinoSpoke && openvinoHasLanding) {
  spokePlugins.push([
    "@docusaurus/plugin-client-redirects",
    {
      redirects: [{ from: "/", to: `/${openvinoSpoke.routeBasePath}/` }],
    },
  ]);
}

// In SPOKE mode, if the selected spoke has a _landing page it is already
// mounted at "/" by landingPagePlugin — no redirect needed. If it has no
// landing, redirect root to docs so "/" never 404s. This is generic across
// all spokes, not only OpenVINO.
if (SPOKE_MODE && selectedSpoke && !spokeHasLandingPage(selectedSpoke)) {
  spokePlugins.push([
    "@docusaurus/plugin-client-redirects",
    {
      redirects: [{ from: "/", to: "/docs/" }],
    },
  ]);
}

// In BUILD_ALL_SPOKES, OpenVINO has no dedicated landing page so its bare
// /openvino/ path would 404 — redirect it to the docs root.
if (!SPOKE_MODE && openvinoSpoke && !openvinoHasLanding) {
  spokePlugins.push([
    "@docusaurus/plugin-client-redirects",
    {
      redirects: [
        {
          from: `/${openvinoSpoke.routeBasePath}/`,
          to: `/${openvinoSpoke.routeBasePath}/docs/`,
        },
      ],
    },
  ]);
}

const config: Config = {
  title: "OpenVINO Documentation",
  favicon: "img/favicon.png",

  // Production URL of the site. Override per deployment via $SITE_URL.
  url: SITE_ORIGIN,
  // URL prefix under which the site is served. The bundle owns this prefix
  // entirely (its assets are emitted under it). Each deploy mode picks a
  // disjoint baseUrl so multiple bundles can coexist on the same bucket
  // without `--delete` wiping each other's assets:
  //   HUB_ONLY=1         → / (or $BASE_URL).
  //   BUILD_ALL_SPOKES=1 → $BASE_URL (e.g. /pr/<id>/<N>/).
  //   SPOKE=<id>         → /<rbp>/ (or $BASE_URL for previews).
  baseUrl: BASE_URL,

  organizationName: "open-edge-platform",
  projectName: "edge-manage-docs",

  customFields: {
    // Exposed to client-side code via useDocusaurusContext(). Always
    // advertises every spoke so shared UI can render the same card grid
    // regardless of build mode.
    // `href` is a fully-qualified absolute URL so cross-bundle links work
    // identically from hub and spoke builds (and across preview prefixes).
    spokes: allSpokes.map((s) => ({
      id: s.id,
      label: SPOKE_CATALOG[s.id]?.label ?? s.id,
      description: SPOKE_CATALOG[s.id]?.description,
      routeBasePath: s.routeBasePath,
      repo: s.repo,
      href: `${SITE_ORIGIN}${SPOKES_ROOT}${s.routeBasePath}/`,
    })),
    // Absolute URL of the hub entry page (redirect target lives at
    // /spoke/openvino/_landing in non-SPOKE builds).
    // Used by the ProductGridDropdown for the OpenVINO card when the current
    // bundle is a spoke at a prefixed baseUrl.
    hubUrl: `${SITE_ORIGIN}${SPOKES_ROOT}`,
    // The spoke this bundle was built for (SPOKE mode only). Baked at build
    // time so useCurrentSpoke can trust it instead of parsing a prefixed URL.
    currentSpokeId: SPOKE_MODE ? selectedSpoke!.id : undefined,
    // IDs of spokes whose doc routes exist in this bundle. Empty in HUB_ONLY;
    // one entry in SPOKE mode; all entries in BUILD_ALL_SPOKES. Used by
    // DocumentationLink to decide between client-side and full-page navigation.
    bundledSpokeIds: spokes.map((s) => s.id),
  },

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  // S3 + CloudFront serves /foo/ as /foo/index.html but does NOT rewrite
  // /foo to /foo/index.html. Generating links with a trailing slash keeps
  // every internal nav working without a CloudFront Function.
  trailingSlash: true,

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: HUB_ONLY ? false : docsPluginOptions(firstSpoke),
        blog: false,
        // Hub pages (src/pages/) serve the hub landing in HUB_ONLY builds.
        // In SPOKE mode we never emit them. In BUILD_ALL_SPOKES when OpenVINO
        // has its own landing page we also disable them so the root route is
        // free for plugin-client-redirects to write build/index.html.
        pages:
          SPOKE_MODE || (BUILD_ALL_SPOKES && openvinoHasLanding)
            ? false
            : undefined,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  plugins: spokePlugins,

  themes: [
    // The search theme's <SearchBar> hooks into the docs plugin's global
    // data. In hub-only builds there's no docs plugin, so we drop the
    // search theme entirely.

    ...(HUB_ONLY
      ? []
      : ([
          [
            require.resolve("@easyops-cn/docusaurus-search-local"),
            {
              hashed: true,
              highlightSearchTermsOnTargetPage: true,
              searchBarShortcutHint: false,
              docsRouteBasePath: spokes.map((s) => docsRouteBasePath(s)),
              docsDir: spokes.map((s) =>
                path.join(spokeCheckoutDir(s), "docs"),
              ),
              // Scope search per spoke site so /genai/ search doesn't return
              // /openvino/ or /physicalai/ hits. Irrelevant in SPOKE mode (a
              // single site rooted at '/').
              ...(SPOKE_MODE
                ? {}
                : {
                    searchContextByPaths: spokes.map((s) => s.routeBasePath),
                    useAllContextsWithNoSearchContext: true,
                  }),
            },
          ],
        ] as Config["themes"] & object[])),
  ],

  themeConfig: {
    colorMode: { disableSwitch: true, defaultMode: "light" },
    navbar: {
      items: [
        {
          type: "custom-openVINOLogo" as const,
          position: "left" as const,
        },
        {
          type: "custom-productGrid" as const,
          label: "OpenVINO Runtime",
          position: "left" as const,
        },
        {
          type: "custom-documentationLink" as const,
          label: "Documentation",
          position: "left" as const,
        },
        ...(SPOKE_MODE
          ? [
              {
                type: "docsVersionDropdown" as const,
                position: "right" as const,
              },
            ]
          : HUB_ONLY
            ? []
            : allSpokes.map((spoke) => ({
                type: "custom-spokeVersionDropdown" as const,
                position: "right" as const,
                docsPluginId: docsPluginId(spoke),
                routePrefix: `${BASE_URL}${spoke.routeBasePath}/`,
              }))),
      ],
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
    footer: {
      style: "dark",
      copyright: `<div class="legal-footer">
        <span>\u00a9 ${new Date().getFullYear()} Intel Corporation</span>
        <a href="https://www.intel.com/content/www/us/en/legal/terms-of-use.html">Terms of Use</a>
        <a href="https://www.intel.com/content/www/us/en/privacy/intel-cookie-notice.html">Cookies</a>
        <a href="https://www.intel.com/content/www/us/en/privacy/intel-privacy-notice.html">Privacy Policy</a>
      
      </div>`,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
