import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Element, Root } from "hast";

// The original Sphinx build's narrative pages (and the `rst2md` conversion
// that produced this site's Markdown source) embed raw HTML that still
// points at Sphinx's shared `_static/` asset tree using *relative* paths,
// e.g. `../_static/selector-tool/selector-1f229db.html` or
// `_static/css/getstarted_style.css`. Those paths were only ever valid next
// to the original flat Sphinx HTML output; once rendered through
// Docusaurus's MDX pipeline they resolve against the *route* (e.g.
// `/openvino/docs/get-started/install-openvino/`), not a filesystem
// location, so they 404.
//
// `tools/vendor_shared_static_assets.py` vendors the small subset of
// `_static/` that narrative pages actually reference into
// `static/_static/`, which Docusaurus serves at the site root (mirrored to
// `/<routeBasePath>/_static/...` locally -- see the `*-static-local-mount`
// postBuild plugin in docusaurus.config.ts for why that mirroring step is
// needed). This rehype plugin rewrites every `src`/`href` attribute that
// (optionally through one or more `../` segments) points at `_static/...`
// to the absolute, depth-independent `/${routeBasePath}/_static/...` so the
// same Markdown renders correctly regardless of how deeply nested the page
// is in the sidebar.
const STATIC_REF = /^(?:\.\.\/)*_static\/(.+)$/;

const ATTRS_TO_FIX = ["src", "href"] as const;

export function rehypeFixStaticAssetPaths(routeBasePath: string): Plugin<[], Root> {
  const prefix = `/${routeBasePath}/_static/`;
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      for (const attr of ATTRS_TO_FIX) {
        const value = node.properties?.[attr];
        if (typeof value !== "string") continue;
        const match = STATIC_REF.exec(value);
        if (match) {
          node.properties![attr] = prefix + match[1];
        }
      }
    });
  };
}
