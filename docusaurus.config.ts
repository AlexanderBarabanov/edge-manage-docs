import type * as Preset from "@docusaurus/preset-classic";
import type { Config, PluginConfig } from "@docusaurus/types";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { themes as prismThemes } from "prism-react-renderer";
import { load as yamlLoad } from "js-yaml";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
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
  rootRedirectSpoke: string;
};

const REPO_ROOT = __dirname;
const SPOKES_DIR = "spokes";

const spokesYml = yamlLoad(readFileSync(path.join(REPO_ROOT, "spokes.yml"), "utf8")) as SpokesYml;

const allSpokes: SpokeConfig[] = spokesYml.spokes;

// Id of the spoke the site root ("/") redirects to. Declared once at the top
// level of spokes.yml so there is a single source of truth for "which product
// is the landing page". Validated below once the build mode is known.
const ROOT_REDIRECT_SPOKE_ID = (spokesYml.rootRedirectSpoke ?? "").trim();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");

// Exactly one of these three modes must be selected. No defaults, no fallbacks.
// Each mode emits a single self-contained Docusaurus bundle whose webpack
// `publicPath` is set by `baseUrl` below — so its assets live entirely under
// that prefix and never collide with bundles deployed at sibling prefixes:
//   ROOT_REDIRECT=1    → site root only: a single index.html that redirects
//                        to the spoke named by `rootRedirectSpoke` in
//                        spokes.yml. baseUrl = / (or $BASE_URL).
//   BUILD_ALL_SPOKES=1 → root redirect + every spoke (used by previews),
//                         baseUrl from $BASE_URL (e.g. /pr/<id>/<N>/).
//   SPOKE=<id>         → that spoke alone. In CI: baseUrl = /<rbp>/, the bundle
//                        owns "/" and `build/` deploys to the spoke's prefix.
//                        Locally (no CI): baseUrl = / with the spoke nested
//                        under /<rbp>/ plus a "/" → /<rbp>/ redirect, so a
//                        single `npm run serve`/`start` lands on the spoke.
//
// Versioning is handled by Docusaurus' standard multi-version docs plugin.
// Each spoke owns its own `docs-versions/` (versions.json + versioned_docs/
// + versioned_sidebars/) which clone-spokes.sh symlinks into hub root with
// the appropriate `<id>_` prefix per plugin instance.
const ROOT_REDIRECT = process.env.ROOT_REDIRECT === "1";
const BUILD_ALL_SPOKES = process.env.BUILD_ALL_SPOKES === "1";
const SPOKE = (process.env.SPOKE ?? "").trim();

// GitHub Actions (and most CI) set CI=true. It only affects how a single-spoke
// build (SPOKE=<id>) is laid out — see LOCAL_SINGLE_SPOKE / SPOKE_MODE below.
// Every multi-bundle/deploy decision stays env-driven, so CI never changes the
// production artifact.
const CI = /^(1|true|yes)$/i.test((process.env.CI ?? "").trim());

// Site origin (no trailing slash). Used for the canonical site URL and for
// cross-bundle navbar links (those need an absolute URL so Docusaurus treats
// them as external and skips baseUrl prefixing).
const SITE_URL = (process.env.SITE_URL ?? "").trim();
if (!SITE_URL) {
  throw new Error("SITE_URL must be set (e.g. https://docs.example.com).");
}
const SITE_ORIGIN = SITE_URL.replace(/\/+$/, "");

const modesSet = [ROOT_REDIRECT, BUILD_ALL_SPOKES, !!SPOKE].filter(Boolean).length;
if (modesSet !== 1) {
  throw new Error(
    "Exactly one build mode must be set: ROOT_REDIRECT=1, BUILD_ALL_SPOKES=1, or SPOKE=<id>.",
  );
}
const selectedSpoke = SPOKE ? allSpokes.find((s) => s.id === SPOKE) : undefined;
if (SPOKE && !selectedSpoke) {
  throw new Error(`SPOKE='${SPOKE}' not found in spokes.yml.`);
}

// A single-spoke build behaves differently depending on where it runs:
//   - In CI it is the production per-spoke deploy (SPOKE_MODE): the bundle is
//     rooted at /<rbp>/ and owns "/", so `build/` syncs straight to the
//     spoke's S3 prefix.
//   - Locally (LOCAL_SINGLE_SPOKE) we build the spoke with the multi-spoke
//     layout instead — baseUrl "/", the spoke nested under /<rbp>/, plus a
//     root redirect to it — so `docusaurus serve`/`start` makes "/" land on
//     the spoke, mirroring production's hub root redirect. Set CI=1 locally to
//     reproduce the exact production per-spoke artifact.
const LOCAL_SINGLE_SPOKE = !!SPOKE && !CI;
const SPOKE_MODE = !!SPOKE && CI;

// Builds that own the site root emit the "/" → spoke redirect, so they need a
// redirect target. ROOT_REDIRECT and BUILD_ALL_SPOKES use the configured
// `rootRedirectSpoke`; a LOCAL_SINGLE_SPOKE build redirects to the one spoke it
// is building. SPOKE_MODE (production per-spoke) never serves "/", so the field
// is irrelevant there.
const rootRedirectSpoke = LOCAL_SINGLE_SPOKE
  ? selectedSpoke
  : allSpokes.find((s) => s.id === ROOT_REDIRECT_SPOKE_ID);
if (!SPOKE_MODE && !LOCAL_SINGLE_SPOKE) {
  if (!ROOT_REDIRECT_SPOKE_ID) {
    throw new Error(
      "spokes.yml must set `rootRedirectSpoke: <id>` — the spoke the site root redirects to.",
    );
  }
  if (!rootRedirectSpoke) {
    throw new Error(
      `rootRedirectSpoke '${ROOT_REDIRECT_SPOKE_ID}' does not match any spoke id in spokes.yml.`,
    );
  }
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

const spokes: SpokeConfig[] = ROOT_REDIRECT ? [] : BUILD_ALL_SPOKES ? allSpokes : [selectedSpoke!];

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

// Sidebar-item helpers used by the openvino spoke's multi-parent override
// below. They match on the *suffix* of a doc/category's id rather than a
// hardcoded full id, since Docusaurus's id format for `index.md`/category
// pages can vary and suffix matching stays correct either way. Category ids
// come from their `link.id`, which for an autogenerated `name/index.md`
// category is `.../name/index` (not just `.../name`), so the match also
// checks the `<idSuffix>/index` form.
function sidebarItemId(item: any): string | undefined {
  if (item.type === "doc") return item.id;
  if (item.type === "category") return item.link?.id;
  return undefined;
}

function idMatches(id: string | undefined, idSuffix: string): boolean {
  if (!id) return false;
  return id.endsWith(idSuffix) || id.endsWith(`${idSuffix}/index`);
}

// Removes and returns the first item (searched recursively) whose id ends
// with `idSuffix`. Used for pages that must move to a new parent.
function extractSidebarItem(items: any[], idSuffix: string): any | undefined {
  const index = items.findIndex((item) => idMatches(sidebarItemId(item), idSuffix));
  if (index !== -1) return items.splice(index, 1)[0];
  for (const item of items) {
    if (item.type === "category" && item.items) {
      const nested = extractSidebarItem(item.items, idSuffix);
      if (nested) return nested;
    }
  }
  return undefined;
}

// Removes and returns the first *link-less* category (no index.md of its
// own, so sidebarItemId() is undefined -- a pure bucket folder) whose first
// child's id contains `idInfix`. Used for wrapper categories like
// model-optimization-guide/ that must be discarded wholesale once their
// children are re-parented elsewhere.
function extractLinklessCategoryByChildId(items: any[], idInfix: string): any | undefined {
  const index = items.findIndex(
    (item) =>
      item.type === "category" &&
      sidebarItemId(item) === undefined &&
      item.items?.some((child: any) => sidebarItemId(child)?.includes(idInfix)),
  );
  if (index !== -1) return items.splice(index, 1)[0];
  for (const item of items) {
    if (item.type === "category" && item.items) {
      const nested = extractLinklessCategoryByChildId(item.items, idInfix);
      if (nested) return nested;
    }
  }
  return undefined;
}

// Finds (without removing) the first category whose id ends with `idSuffix`.
function findSidebarCategory(items: any[], idSuffix: string): any | undefined {
  for (const item of items) {
    if (item.type !== "category") continue;
    if (idMatches(sidebarItemId(item), idSuffix)) return item;
    const nested = findSidebarCategory(item.items ?? [], idSuffix);
    if (nested) return nested;
  }
  return undefined;
}

// Re-nest the openvino spoke's known multi-parent pages (see the long
// comment at the `sidebarItemsGenerator` call site) so the rendered sidebar
// matches docs.openvino.ai/nightly instead of leaving these pages as flat,
// un-nested top-level items. Every lookup is defensive (falls through to a
// no-op) so a future content restructuring degrades gracefully instead of
// breaking the build.
function applyOpenvinoSidebarOverrides(items: any[]): void {
  const linux = findSidebarCategory(items, "install-openvino-linux");
  const windows = findSidebarCategory(items, "install-openvino-windows");
  const macos = findSidebarCategory(items, "install-openvino-macos");

  // Single-parent install-method pages: extract once and attach to their one
  // real OS parent (matches docs.openvino.ai/nightly/get-started/install-
  // openvino.html; these never appear under more than one OS).
  const singleParent: [any, string[]][] = [
    [linux, ["install-openvino-archive-linux", "install-openvino-apt", "install-openvino-yum", "install-openvino-zypper"]],
    [windows, ["install-openvino-archive-windows", "install-openvino-winget"]],
    [macos, ["install-openvino-archive-macos"]],
  ];
  for (const [category, suffixes] of singleParent) {
    if (!category?.items) continue;
    for (const suffix of suffixes) {
      const found = extractSidebarItem(items, suffix);
      if (found) category.items.push(found);
    }
  }

  // Multi-parent install-method pages: extract the flat top-level item once,
  // then attach the *same* item object to every OS category that references
  // it in the real site. Reusing one object reference (rather than
  // re-extracting per OS) avoids stealing an already-placed item back out of
  // an earlier OS category.
  const sharedTargets: [string, any[]][] = [
    ["install-openvino-pip", [linux, windows, macos]],
    ["install-openvino-conda", [linux, windows, macos]],
    ["install-openvino-vcpkg", [linux, windows, macos]],
    ["install-openvino-brew", [linux, macos]],
    ["install-openvino-docker-linux", [linux, windows]],
    ["install-openvino-conan", [linux, windows, macos]],
    ["install-openvino-npm", [linux, windows, macos]],
  ];
  for (const [suffix, categories] of sharedTargets) {
    const found = extractSidebarItem(items, suffix);
    if (!found) continue;
    for (const category of categories) {
      if (category?.items) category.items.push(found);
    }
  }

  // "System Requirements" physically lives under
  // about-openvino/release-notes-openvino/ but is also cross-referenced from
  // get-started.rst's own toctree. Leave the physical copy where it is and
  // add a second reference to the same doc id under "Get Started" (the same
  // item object can safely appear twice in the sidebar tree).
  const getStarted = findSidebarCategory(items, "get-started");
  const systemRequirements = findSidebarCategory(items, "release-notes-openvino")?.items?.find(
    (item: any) => sidebarItemId(item)?.endsWith("system-requirements"),
  );
  if (getStarted?.items && systemRequirements) {
    getStarted.items.push(systemRequirements);
  }

  // Single-parent-but-flat clusters: each child below physically lives as a
  // sibling of its toctree parent (not nested in parent/dir/stem/), so
  // Docusaurus's physical-folder-mirroring autogenerator places it as a flat
  // top-level sibling of the parent category instead of inside it. Unlike
  // the multi-parent cases above, each of these has exactly one real parent,
  // so a plain extract-and-push (no by-reference sharing) is correct.

  // Cluster 1: convert-model-to-ir's 7 per-framework children physically sit
  // flat in model-preparation/, as siblings of conversion-parameters.md and
  // setting-input-shapes.md (convert-model-to-ir's own aunts, not children).
  // Confirmed live bug: without this fix, convert-model-tensorflow.md and
  // conversion-parameters.md collide at sidebar_position 2 (and
  // convert-model-onnx.md / setting-input-shapes.md collide at position 3).
  const convertModelToIr = findSidebarCategory(items, "convert-model-to-ir");
  if (convertModelToIr?.items) {
    for (const suffix of [
      "convert-model-pytorch",
      "convert-model-tensorflow",
      "convert-model-onnx",
      "convert-model-tensorflow-lite",
      "convert-model-paddle",
      "convert-model-jax",
      "convert-model-keras",
    ]) {
      const found = extractSidebarItem(items, suffix);
      if (found) convertModelToIr.items.push(found);
    }
  }

  // Cluster 2: model-optimization's 3 children physically live in a
  // differently-named sibling folder, model-optimization-guide/ (each
  // already its own category with further children). The real site nests
  // these 3 under "Model Optimization"; without this fix they render as a
  // separate, detached top-level "Model Optimization Guide" category.
  // model-optimization-guide/ has no index.md of its own -- it's a pure
  // bucket folder -- so the whole wrapper category (not its 3 children
  // individually) must be extracted and discarded, moving only its `items`
  // up; otherwise the now-empty wrapper is left behind with neither a link
  // nor subitems, which Docusaurus rejects at build time.
  const modelOptimization = findSidebarCategory(items, "model-optimization");
  const modelOptimizationGuide = extractLinklessCategoryByChildId(
    items,
    "model-optimization-guide/",
  );
  if (modelOptimization?.items && modelOptimizationGuide?.items) {
    modelOptimization.items.push(...modelOptimizationGuide.items);
  }

  // Cluster 3: low-precision-transformations/step3-main.rst and
  // step4-cleanup.rst each cross-link exactly one operation-reference page
  // that physically "belongs" (by folder) to the other. Deep, rarely
  // browsed; fixed the same way for completeness/consistency.
  const step3Main = findSidebarCategory(items, "low-precision-transformations/step3-main");
  if (step3Main?.items) {
    const found = extractSidebarItem(
      items,
      "low-precision-transformations/step4-cleanup/fake-quantize-decomposition",
    );
    if (found) step3Main.items.push(found);
  }
  const step4Cleanup = findSidebarCategory(items, "low-precision-transformations/step4-cleanup");
  if (step4Cleanup?.items) {
    const found = extractSidebarItem(
      items,
      "low-precision-transformations/step3-main/quantization/fold-fake-quantize",
    );
    if (found) step4Cleanup.items.push(found);
  }
}

function docsPluginOptions(spoke: SpokeConfig) {
  const spokeDir = spokeCheckoutDir(spoke);
  return {
    path: path.join(spokeDir, "docs"),
    routeBasePath: docsRouteBasePath(spoke),
    sidebarPath: require.resolve("./sidebars/auto.ts"),
    editUrl: ({ docPath }: { docPath: string }) =>
      `https://github.com/${spoke.repo}/edit/${spoke.ref}/docs/${docPath}`,
    // LaTeX math support (remark-math parses $...$ / $$...$$ into math
    // nodes, rehype-katex typesets them) -- see docusaurus_stage.py's math
    // handling, which emits real $...$/$$...$$ once this is configured.
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    async sidebarItemsGenerator({ defaultSidebarItemsGenerator, ...args }: any) {
      const excludeCategories = args.item.customProps?.excludeCategories as string[] | undefined;
      const items = await defaultSidebarItemsGenerator(args);
      const filtered = items.filter(
        (i: any) =>
          !(excludeCategories && i.type === "category" && excludeCategories.includes(i.label)),
      );
      // The openvino spoke's source (Sphinx) toctrees list a handful of pages
      // under more than one parent (e.g. the pip/conda/vcpkg/etc. install
      // methods are each referenced from the Linux, Windows, *and* macOS
      // install guides; "System Requirements" is cross-referenced from both
      // "Get Started" and "Release Notes"). Sphinx supports this because its
      // toctree is a pure link graph, decoupled from physical file location.
      // Docusaurus's autogenerated sidebar mirrors the physical folder
      // structure 1:1, so it can only place each file in one spot -- these
      // pages land as flat, un-nested top-level siblings of their category
      // instead. Re-attach them (by reference, not by copy) under every
      // parent category the real site nests them under, matching
      // docs.openvino.ai's TOC exactly without duplicating any content.
      if (spoke.id === "openvino" && args.item.dirName === ".") {
        applyOpenvinoSidebarOverrides(filtered);
      }
      return filtered;
    },
  };
}

function docsPlugin(spoke: SpokeConfig): PluginConfig {
  return [
    "@docusaurus/plugin-content-docs",
    { id: docsPluginId(spoke), ...docsPluginOptions(spoke) },
  ];
}

function landingPagePlugin(spoke: SpokeConfig): PluginConfig | null {
  // Optional landing page lives at `docs/_landing/` inside the spoke — the
  // leading underscore tells the docs plugin to ignore the folder, so a single
  // `docs/` tree holds both docs content and the landing page source.
  const landingDir = path.join(spokeCheckoutDir(spoke), "docs", "_landing");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("fs").statSync(path.join(REPO_ROOT, landingDir));
  } catch {
    return null;
  }
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
  const docsRouteBase = SPOKE_MODE ? "/docs/samples" : `/${spoke.routeBasePath}/docs/samples`;
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
  // docs plugins for additional spokes. In root-redirect builds (no spoke
  // checkouts) `firstSpoke` is undefined and there's nothing to wire here.
  ...otherSpokes.map(docsPlugin),
  ...spokes.flatMap((spoke) =>
    [landingPagePlugin(spoke), samplesPlugin(spoke)].filter((p): p is PluginConfig => p !== null),
  ),
];

// Site root ("/") redirect. ROOT_REDIRECT and BUILD_ALL_SPOKES own the root of
// their bundle; instead of a hub landing page we emit a single index.html that
// forwards visitors to the configured spoke's landing. The target is
// root-relative so it works at every deploy prefix (prod "/", previews
// "/pr/hub/<N>/"): BASE_URL already ends in "/", so `${BASE_URL}<rbp>/`
// resolves to e.g. "/openvino/" or "/pr/hub/12/openvino/".
if (!SPOKE_MODE) {
  const target = `${BASE_URL}${rootRedirectSpoke!.routeBasePath}/`;
  const canonical = `${SITE_ORIGIN}${target}`;
  const redirectHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Redirecting…</title>
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="canonical" href="${canonical}" />
  </head>
  <body>
    <script>
      location.replace(${JSON.stringify(target)} + location.search + location.hash);
    </script>
    <p>Redirecting to <a href="${target}">the documentation</a>…</p>
  </body>
</html>
`;
  const rootRedirectPlugin: PluginConfig = () => ({
    name: "root-redirect",
    async postBuild({ outDir }: { outDir: string }) {
      await fs.promises.writeFile(path.join(outDir, "index.html"), redirectHtml, "utf8");
    },
  });
  spokePlugins.push(rootRedirectPlugin);
}

const config: Config = {
  title: "OpenVINO Documentation",
  favicon: "img/favicon.png",

  // KaTeX's stylesheet (required for rehype-katex output to render
  // correctly), per Docusaurus's documented math-support recipe.
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity: "sha384-odtC+0UGzzFL/6PNoE8rX/SPnx3vxxpBSChTMNfKAX2Yb8OhqFTkQtjfvbn5CTQZ",
      crossorigin: "anonymous",
    },
  ],

  // Production URL of the site. Override per deployment via $SITE_URL.
  url: SITE_ORIGIN,
  // URL prefix under which the site is served. The bundle owns this prefix
  // entirely (its assets are emitted under it). Each deploy mode picks a
  // disjoint baseUrl so multiple bundles can coexist on the same bucket
  // without `--delete` wiping each other's assets:
  //   ROOT_REDIRECT=1    → / (or $BASE_URL).
  //   BUILD_ALL_SPOKES=1 → $BASE_URL (e.g. /pr/<id>/<N>/).
  //   SPOKE=<id>         → /<rbp>/ (or $BASE_URL for previews).
  baseUrl: BASE_URL,

  organizationName: "open-edge-platform",
  projectName: "edge-manage-docs",

  customFields: {
    // Exposed to client-side code (e.g. the hub landing page) via
    // useDocusaurusContext(). Always advertises every spoke so the hub
    // landing renders the same card grid regardless of build mode.
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
    // The spoke this bundle was built for (SPOKE mode only). Baked at build
    // time so useCurrentSpoke can trust it instead of parsing a prefixed URL.
    currentSpokeId: SPOKE_MODE ? selectedSpoke!.id : undefined,
    // IDs of spokes whose doc routes exist in this bundle. Empty in
    // ROOT_REDIRECT; one entry in SPOKE mode; all entries in BUILD_ALL_SPOKES.
    // Used by DocumentationLink to decide between client-side and full-page
    // navigation.
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
        docs: ROOT_REDIRECT ? false : docsPluginOptions(firstSpoke),
        blog: false,
        // No src/pages/ landing: the site root is served by the root-redirect
        // plugin (see above), and spoke bundles never own "/". Disabling pages
        // everywhere keeps every bundle free of a stray hub landing route.
        pages: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  plugins: spokePlugins,

  themes: [
    // The search theme's <SearchBar> hooks into the docs plugin's global
    // data. In root-redirect builds there's no docs plugin, so we drop the
    // search theme entirely (the redirect bundle has no content to search).

    ...(ROOT_REDIRECT
      ? []
      : ([
          [
            require.resolve("@easyops-cn/docusaurus-search-local"),
            {
              hashed: true,
              highlightSearchTermsOnTargetPage: true,
              searchBarShortcutHint: false,
              docsRouteBasePath: spokes.map((s) => docsRouteBasePath(s)),
              docsDir: spokes.map((s) => path.join(spokeCheckoutDir(s), "docs")),
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
          : ROOT_REDIRECT
            ? []
            : spokes.map((spoke) => ({
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
