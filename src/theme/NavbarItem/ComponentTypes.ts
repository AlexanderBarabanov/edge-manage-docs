import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import SpokeVersionDropdown from '@site/src/theme/NavbarItem/SpokeVersionDropdown';

// Register `custom-spokeVersionDropdown` so docusaurus.config.ts can wire one
// route-scoped version dropdown per spoke in BUILD_ALL_SPOKES navbar items.
export default {
  ...ComponentTypes,
  'custom-spokeVersionDropdown': SpokeVersionDropdown,
};
