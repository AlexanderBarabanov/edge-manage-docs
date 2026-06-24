import { useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useCurrentSpoke } from "./use-current-spoke";
import { useSpokes } from "./use-spokes";

export type NavState = {
  // The Product Catalog dropdown trigger is highlighted.
  productActive: boolean;
  // The Documentation link is highlighted.
  docsActive: boolean;
};

// Single source of truth for the two left-navbar items' active state. They are
// mutually exclusive — exactly one is highlighted on any product landing or
// docs route, never both:
//
//   - hub root (= the OpenVINO product landing) or any spoke landing
//     (e.g. /genai/) → productActive
//   - any `<rbp>/docs/…` route, including generated samples and versioned docs
//     (e.g. /genai/docs/…, /genai/docs/2026.2/…) → docsActive
//
// Mode-safe: the spoke's landing path is derived from its `href` (which already
// bakes in baseUrl + routeBasePath for the active build mode) rather than
// hard-coding any prefix. OpenVINO is special — it has no landing of its own,
// so its landing is the hub root (baseUrl); the `pathname === baseUrl` clause
// covers that, and also the spoke landing in SPOKE mode (baseUrl = /<rbp>/).
export const useNavState = (): NavState => {
  const { pathname } = useLocation();
  const { siteConfig } = useDocusaurusContext();
  const spokes = useSpokes();
  const spoke = useCurrentSpoke();

  const fallback = spokes.find((s) => s.id === "openvino") ?? spokes[0];
  const active = spoke ?? fallback;

  const baseUrl = (siteConfig.baseUrl ?? "/").replace(/\/?$/, "/");
  // e.g. "/genai/" (or "/pr/<id>/<N>/genai/" in previews). For OpenVINO this is
  // "/openvino/", but its real landing is the hub root — see note above.
  const landingPath = active ? new URL(active.href).pathname : baseUrl;

  const docsActive = pathname.startsWith(`${landingPath}docs/`);
  // `!docsActive` keeps the two states mutually exclusive by construction.
  const productActive = !docsActive && (pathname === baseUrl || pathname === landingPath);

  return { productActive, docsActive };
};
