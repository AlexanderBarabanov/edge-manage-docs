import { useState } from "react";
import { useSpokes } from "@site/src/hooks/use-spokes";
import { translate } from "@docusaurus/Translate";
import clsx from "clsx";

type Props = {
  position?: "left" | "right";
  className?: string;
  mobile?: boolean;
};

// The hub landing IS the OpenVINO Runtime landing, but a hub-only bundle has
// no docs plugin and therefore no local search index (the easyops search
// theme is dropped — see docusaurus.config.ts). Rather than ship a dead
// search box, this item forwards queries to the OpenVINO Runtime spoke's own
// search page, which owns the runtime docs index.
//
// The target is the `openvino` spoke's absolute, cross-bundle search URL
// (`<origin>/openvino/search?q=...`). It's an absolute URL into a sibling
// bundle, so we do a full-page navigation rather than client-side routing.
function runtimeSearchHref(spokeHref: string, query: string): string {
  // spokeHref is an absolute URL ending with "/".
  const base = `${spokeHref}search`;
  const q = query.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}

export default function RuntimeSearchNavbarItem(props: Props) {
  const spokes = useSpokes();
  const [value, setValue] = useState("");

  const runtimeSpoke =
    spokes.find(({ id }) => id === "openvino") ?? spokes[0];

  // No spoke to forward to (shouldn't happen in practice). Render nothing
  // rather than a search box that goes nowhere.
  if (!runtimeSpoke) {
    return null;
  }

  const placeholder = translate({
    id: "theme.SearchBar.label",
    message: "Search",
    description: "The ARIA label and placeholder for search button",
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.assign(runtimeSearchHref(runtimeSpoke.href, value));
  };

  const input = (
    <input
      type="search"
      placeholder={placeholder}
      aria-label={placeholder}
      className="navbar__search-input"
      autoComplete="off"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );

  if (props.mobile) {
    return (
      <li className="menu__list-item">
        <form
          className={clsx("navbar__search", props.className)}
          role="search"
          onSubmit={onSubmit}
        >
          {input}
        </form>
      </li>
    );
  }

  return (
    <form
      className={clsx("navbar__search", props.className)}
      role="search"
      onSubmit={onSubmit}
    >
      {input}
    </form>
  );
}
