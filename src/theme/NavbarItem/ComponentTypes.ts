import ComponentTypes from "@theme-original/NavbarItem/ComponentTypes";
import SpokeVersionDropdown from "@site/src/theme/NavbarItem/SpokeVersionDropdown";
import ProductGridDropdown from "@site/src/theme/NavbarItem/ProductGridDropdown";
import DocumentationLink from "@site/src/theme/NavbarItem/DocumentationLink";
import OpenVINOLogo from "@site/src/theme/NavbarItem/OpenVINOLogo";
import RuntimeSearch from "@site/src/theme/NavbarItem/RuntimeSearch";

// Register custom navbar item types so docusaurus.config.ts can wire them
// by `type: 'custom-...'`.
//   custom-spokeVersionDropdown — route-scoped per-spoke version dropdown.
//   custom-productGrid          — "OpenVINO Runtime" product card dropdown.
//   custom-documentationLink    — top-level documentation nav link.
//   custom-openVINOLogo         — OpenVINO logo SVG from static/img/.
//   custom-runtimeSearch        — search box forwarding to the OpenVINO
//                                 Runtime spoke's search page (hub-only
//                                 builds, which have no local search index).
export default {
  ...ComponentTypes,
  "custom-spokeVersionDropdown": SpokeVersionDropdown,
  "custom-productGrid": ProductGridDropdown,
  "custom-documentationLink": DocumentationLink,
  "custom-openVINOLogo": OpenVINOLogo,
  "custom-runtimeSearch": RuntimeSearch,
};
