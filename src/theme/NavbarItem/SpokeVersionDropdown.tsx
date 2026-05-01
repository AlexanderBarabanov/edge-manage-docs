import React from 'react';
import {useLocation} from '@docusaurus/router';
import DocsVersionDropdownNavbarItem from '@theme-original/NavbarItem/DocsVersionDropdownNavbarItem';

// Wraps the built-in docsVersionDropdown so the item is rendered only when
// the current route lives under the owning spoke's `routeBasePath`. This
// keeps the hub landing page free of any version selector and prevents the
// other spokes' selectors from appearing while a user is browsing one
// spoke's pages.
type Props = React.ComponentProps<typeof DocsVersionDropdownNavbarItem> & {
  routePrefix: string;
};

export default function SpokeVersionDropdown({routePrefix, ...rest}: Props): JSX.Element | null {
  const {pathname} = useLocation();
  // Match either '<routePrefix>' exactly or any sub-path under it.
  const normalized = routePrefix.endsWith('/') ? routePrefix : `${routePrefix}/`;
  if (pathname !== routePrefix && !pathname.startsWith(normalized)) {
    return null;
  }
  return <DocsVersionDropdownNavbarItem {...rest} />;
}
