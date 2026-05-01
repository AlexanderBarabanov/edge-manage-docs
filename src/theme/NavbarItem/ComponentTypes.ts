// Swizzled (eject) copy of theme-classic's NavbarItem ComponentTypes.
// Adds the 'custom-versionsDropdown' type used by spoke bundles.
//
// The default export here replaces the upstream registry. Docusaurus' own
// types (default, dropdown, search, etc.) are re-exported unchanged so
// existing navbar items keep working; the only addition is the entry that
// maps our custom type string to the React component below.
import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import VersionsDropdown from '@site/src/theme/NavbarItem/VersionsDropdown';

export default {
  ...ComponentTypes,
  'custom-versionsDropdown': VersionsDropdown,
};
