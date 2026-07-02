import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSiteSearch, type SiteSearchResult } from "@site/src/hooks/use-site-search";
import styles from "./styles.module.css";

// Swizzled theme/SearchBar. Replaces the default (per-bundle) search box with a
// cross-spoke one: it queries the merged index of every spoke (see
// use-site-search) so results from all products show up regardless of which
// spoke the visitor is currently on. Each result links by absolute URL, so
// hits in another spoke's separately-deployed bundle navigate correctly.

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function Highlight({ text, terms }: { text: string; terms: string[] }): React.JSX.Element {
  if (terms.length === 0) return <>{text}</>;
  // Escape regex metacharacters in the user's terms before building the matcher.
  const pattern = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));
  const termSet = new Set(terms);
  return (
    <>
      {parts.map((part, i) =>
        termSet.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
}

export default function SearchBar(): React.JSX.Element {
  const { loading, ready, ensureLoaded, search } = useSiteSearch();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const results = useMemo<SiteSearchResult[]>(
    () => (trimmed ? search(query) : []),
    [trimmed, query, search],
  );
  const terms = useMemo(() => queryTerms(query), [query]);

  useEffect(() => {
    setActive(0);
  }, [results]);

  // Close the results panel on any click outside the search box.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (result: SiteSearchResult | undefined) => {
    if (result) window.location.assign(result.url);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showPanel = open && trimmed.length > 0;

  return (
    <div className={styles.searchContainer} ref={containerRef}>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search all docs"
        aria-label="Search across all documentation"
        value={query}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showPanel && (
        <div className={styles.panel} role="listbox">
          {!ready || loading ? (
            <div className={styles.message}>Loading search index…</div>
          ) : results.length === 0 ? (
            <div className={styles.message}>No results for “{trimmed}”.</div>
          ) : (
            results.map((result, i) => (
              <a
                key={`${result.url}-${i}`}
                href={result.url}
                role="option"
                aria-selected={i === active}
                className={i === active ? `${styles.result} ${styles.resultActive}` : styles.result}
                onMouseEnter={() => setActive(i)}
                onClick={() => setOpen(false)}
              >
                <span className={styles.resultHeader}>
                  <span className={styles.resultTitle}>
                    <Highlight text={result.title} terms={terms} />
                  </span>
                  <span className={styles.spokeBadge}>{result.spokeLabel}</span>
                </span>
                <span className={styles.resultSnippet}>
                  <Highlight text={result.snippet} terms={terms} />
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
