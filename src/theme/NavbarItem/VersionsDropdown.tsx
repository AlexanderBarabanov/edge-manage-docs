// Versions dropdown injected into spoke bundles by the hub at build time.
//
// Each spoke bundle is deployed under its own prefix (e.g. /<rbp>/v1.2/) and
// has no compile-time knowledge of which other versions exist. The hub's
// release workflow regenerates `<bucket>/<rbp>/versions.json` after every
// versioned deploy, listing every version currently on the bucket.
//
// At runtime this component fetches that manifest from a fixed,
// host-absolute URL (so it works regardless of the bundle's baseUrl) and
// renders a Docusaurus-style dropdown. Clicks are full-page navigations
// because each version is a separate bundle at a sibling prefix.
import React, {useEffect, useState} from 'react';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';

type ManifestEntry = {
  // Version label, e.g. 'v1.2'. Matches what the build receives via
  // SPOKE_VERSION and what the release workflow extracts from the tag.
  name: string;
  // Host-absolute path the dropdown entry should navigate to (e.g.
  // '/genai/v1.2/'). Always ends with a slash.
  path: string;
};

type Manifest = {
  // Optional; the version currently served at the unversioned /<rbp>/.
  // Used to label the entry pointing at the redirect path.
  latest?: string;
  versions: ManifestEntry[];
};

type Props = {
  // The spoke's routeBasePath (without slashes). Used to locate the
  // manifest on the bucket: `<siteOrigin>/<spokeRouteBasePath>/versions.json`.
  spokeRouteBasePath: string;
  // Production origin (no trailing slash). Captured at build time so the
  // fetch URL doesn't depend on whatever host the bundle is served from.
  siteOrigin: string;
  // The version this bundle was built for (e.g. 'v1.2'), or empty string
  // for the merge build that lives at the unversioned prefix. Used to
  // mark the active item in the dropdown.
  currentVersion: string;
  // Forwarded to DropdownNavbarItem (other navbar item props).
  [key: string]: unknown;
};

export default function VersionsDropdown({
  spokeRouteBasePath,
  siteOrigin,
  currentVersion,
  ...rest
}: Props): React.JSX.Element | null {
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    // Manifest URL is a fixed host-absolute path so it resolves the same
    // way regardless of which version's baseUrl the user is currently on.
    const url = `${siteOrigin}/${spokeRouteBasePath}/versions.json`;
    let cancelled = false;
    fetch(url, {cache: 'no-cache'})
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Manifest | null) => {
        if (!cancelled) setManifest(data);
      })
      .catch(() => {
        // Network error or invalid JSON: render nothing rather than a
        // half-broken dropdown.
        if (!cancelled) setManifest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteOrigin, spokeRouteBasePath]);

  // Hide the dropdown until the manifest tells us at least two versions
  // exist; a single-version site doesn't need a switcher.
  if (!manifest || !Array.isArray(manifest.versions) || manifest.versions.length < 2) {
    return null;
  }

  // Build dropdown items. Each entry navigates to the version's prefix,
  // bypassing Docusaurus' SPA Link (target=_self forces a full reload
  // because the destination is a different bundle).
  const items = manifest.versions.map((v) => ({
    label: v.name === manifest.latest ? `${v.name} (latest)` : v.name,
    href: `${siteOrigin}${v.path}`,
    target: '_self' as const,
    className: v.name === currentVersion ? 'dropdown__link--active' : undefined,
  }));

  // Label shown in the navbar: the active version (or 'latest' for the
  // unversioned merge build) so users always know which version they're
  // looking at.
  const label = currentVersion || manifest.latest || 'Versions';

  return <DropdownNavbarItem {...rest} label={label} items={items} />;
}
