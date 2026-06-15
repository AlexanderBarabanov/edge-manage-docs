import { useLocation } from "@docusaurus/router";
import { useSpokes } from "./use-spokes";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

export const useCurrentSpoke = () => {
  const spokes = useSpokes();
  const { pathname } = useLocation();
  const { siteConfig } = useDocusaurusContext();

  // SPOKE bundle: one spoke, baked at build time. The URL may carry an
  // arbitrary deploy prefix (/pr/hub/44/<rbp>/), so read it from config
  // instead of parsing the path.
  const currentSpokeId = siteConfig.customFields?.currentSpokeId;

  if (currentSpokeId) {
    return spokes.find((s) => s.id === currentSpokeId);
  }

  // Hub / all-spokes bundle: infer from the path below baseUrl.
  const baseUrl = (siteConfig.baseUrl ?? "/").replace(/\/?$/, "/");
  const rest = pathname.startsWith(baseUrl)
    ? pathname.slice(baseUrl.length)
    : pathname;
  const spokeSegment = rest.split("/").filter(Boolean)[0];
  if (!spokeSegment) return spokes.find(({ id }) => id === "openvino");
  return spokes.find(({ routeBasePath }) => routeBasePath === spokeSegment);
};
