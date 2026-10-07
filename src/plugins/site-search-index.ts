import type { LoadContext, Plugin } from "@docusaurus/types";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// site-search-index — emits a portable, self-describing search index for each
// spoke that has docs in the current build.
//
// Why a custom index instead of relying on the per-bundle search plugin:
// in production every spoke is built and deployed as an independent bundle
// under its own prefix (/openvino/, /genai/, /physicalai/). A per-bundle
// search index therefore only ever covers a single spoke, so search from one
// product can never surface hits in another. This plugin writes one JSON file
// per spoke — `search-index-<id>.json` — placed so it is served at
// `<spoke href>search-index-<id>.json`. The client (see use-site-search.ts)
// fetches every spoke's file (their locations come from the shared spoke
// catalog) and merges them in the browser, giving true cross-spoke search that
// works even though the spokes are deployed separately.

export type SiteSearchSpoke = {
  /** Spoke id (matches spokes.yml). */
  id: string;
  /** Human-readable label shown next to results. */
  label: string;
  /**
   * Full route base (including this build's baseUrl) under which the spoke's
   * docs are served, e.g. "/openvino/docs". Used to select which built routes
   * belong to the spoke.
   */
  docsBase: string;
  /**
   * Directory (relative to the build outDir) the index file is written into so
   * it lands at `<spoke href>search-index-<id>.json`. Empty in single-spoke
   * (SPOKE) builds where the bundle root already is the spoke prefix; the
   * spoke's routeBasePath in all-spoke builds.
   */
  outSubdir: string;
};

export type SiteSearchIndexPluginOptions = {
  spokes: SiteSearchSpoke[];
};

/** One searchable page. `text`/`headings` are already tag-stripped. */
export type SiteSearchDoc = {
  title: string;
  url: string;
  headings: string;
  text: string;
};

export type SiteSearchIndexFile = {
  spokeId: string;
  spokeLabel: string;
  docs: SiteSearchDoc[];
};

// Cap stored body text per page so the merged index stays small enough to fetch
// cheaply from the browser. Enough for term matching plus a result snippet.
const MAX_TEXT_CHARS = 1500;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const codePoint =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strip HTML tags (and script/style contents) and collapse whitespace. */
function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractDoc(html: string, url: string): SiteSearchDoc | null {
  // Prefer the docs <article>; fall back to <main>, then the whole page.
  const body =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html;

  const headings = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);

  const text = stripHtml(body);
  if (!text) return null;

  // Drop the "| Site Title" suffix Docusaurus appends to <title>.
  const rawTitle = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const title = rawTitle.replace(/\s*[|·]\s*[^|·]*$/, "").trim() || headings[0] || url;

  return {
    title,
    url,
    headings: headings.join(" · "),
    text: text.slice(0, MAX_TEXT_CHARS),
  };
}

export default function siteSearchIndexPlugin(
  _context: LoadContext,
  options: SiteSearchIndexPluginOptions,
): Plugin<void> {
  return {
    name: "site-search-index",

    async postBuild({ outDir, baseUrl, routesPaths }) {
      const normalizedBase = baseUrl.replace(/\/?$/, "/");

      for (const spoke of options.spokes) {
        const docsBase = spoke.docsBase.replace(/\/$/, "");
        const routes = routesPaths.filter(
          (route) => route === docsBase || route.startsWith(`${docsBase}/`),
        );
        if (routes.length === 0) continue;

        const docs: SiteSearchDoc[] = [];
        for (const route of routes) {
          // routesPaths include this build's baseUrl; outDir maps to baseUrl,
          // so strip it to locate the emitted index.html on disk.
          const relative = route.startsWith(normalizedBase)
            ? route.slice(normalizedBase.length)
            : route.replace(/^\//, "");
          const htmlPath = path.join(outDir, relative, "index.html");
          let html: string;
          try {
            html = await readFile(htmlPath, "utf8");
          } catch {
            continue; // Route without a static HTML file (e.g. redirect-only).
          }
          const doc = extractDoc(html, route);
          if (doc) docs.push(doc);
        }

        const indexFile: SiteSearchIndexFile = {
          spokeId: spoke.id,
          spokeLabel: spoke.label,
          docs,
        };
        const destDir = path.join(outDir, spoke.outSubdir);
        await mkdir(destDir, { recursive: true });
        await writeFile(
          path.join(destDir, `search-index-${spoke.id}.json`),
          JSON.stringify(indexFile),
          "utf8",
        );
      }
    },
  };
}
