import { useCallback, useEffect, useRef, useState } from "react";
import { useSpokes, type SpokeSummary } from "./use-spokes";
import type { SiteSearchDoc, SiteSearchIndexFile } from "@site/src/plugins/site-search-index";

// use-site-search — client side of the cross-spoke search. Each spoke deploys
// its own `search-index-<id>.json` (see the site-search-index plugin); this
// hook fetches every spoke's file, merges them, and runs a small ranked
// substring search entirely in the browser. That is what lets a query from one
// product surface results from the others even though the spokes are built and
// deployed as independent bundles.

export type SiteSearchResult = {
  title: string;
  url: string;
  spokeId: string;
  spokeLabel: string;
  snippet: string;
};

type LoadedDoc = SiteSearchDoc & {
  spokeId: string;
  spokeLabel: string;
  haystack: string;
};

const MAX_RESULTS = 30;
const SNIPPET_RADIUS = 90;

// Field weights. Title/heading hits rank a page far above a body-only mention.
const TITLE_WEIGHT = 8;
const HEADING_WEIGHT = 4;
const TEXT_WEIGHT = 1;

// Module-level cache so every SearchBar mount (and re-render) shares one fetch
// per spoke for the life of the page.
const spokeCache = new Map<string, Promise<LoadedDoc[]>>();

function indexUrl(spoke: SpokeSummary): string {
  // Use only the path of the (absolute) spoke href so the request stays
  // same-origin as the currently served site — correct in production and under
  // preview prefixes alike.
  const basePath = new URL(spoke.href).pathname.replace(/\/?$/, "/");
  return `${basePath}search-index-${spoke.id}.json`;
}

async function fetchSpokeDocs(spoke: SpokeSummary): Promise<LoadedDoc[]> {
  const cached = spokeCache.get(spoke.id);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const res = await fetch(indexUrl(spoke));
      if (!res.ok) return [];
      const data = (await res.json()) as SiteSearchIndexFile;
      return data.docs.map((doc) => ({
        ...doc,
        spokeId: data.spokeId,
        spokeLabel: data.spokeLabel,
        haystack: `${doc.title}\n${doc.headings}\n${doc.text}`.toLowerCase(),
      }));
    } catch {
      // A spoke whose index is not yet deployed simply contributes no hits.
      return [];
    }
  })();

  spokeCache.set(spoke.id, promise);
  return promise;
}

function countOccurrences(haystack: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(term, from);
    if (at === -1) break;
    count += 1;
    from = at + term.length;
  }
  return count;
}

function scoreDoc(doc: LoadedDoc, terms: string[]): number {
  const title = doc.title.toLowerCase();
  const headings = doc.headings.toLowerCase();
  const text = doc.text.toLowerCase();

  let score = 0;
  for (const term of terms) {
    // AND semantics: every term must appear somewhere in the document.
    if (!doc.haystack.includes(term)) return 0;
    score += countOccurrences(title, term) * TITLE_WEIGHT;
    score += countOccurrences(headings, term) * HEADING_WEIGHT;
    score += countOccurrences(text, term) * TEXT_WEIGHT;
  }
  return score;
}

function buildSnippet(doc: LoadedDoc, terms: string[]): string {
  const lower = doc.text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (at === -1 || idx < at)) at = idx;
  }
  if (at === -1) return doc.text.slice(0, SNIPPET_RADIUS * 2).trim();

  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(doc.text.length, at + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${doc.text.slice(start, end).trim()}${
    end < doc.text.length ? "…" : ""
  }`;
}

export function useSiteSearch() {
  const spokes = useSpokes();
  const [docs, setDocs] = useState<LoadedDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const requested = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setLoading(true);
    Promise.all(spokes.map(fetchSpokeDocs))
      .then((lists) => setDocs(lists.flat()))
      .finally(() => setLoading(false));
  }, [spokes]);

  // Reset the request guard if the spoke set changes (e.g. HMR in dev).
  useEffect(() => {
    requested.current = false;
    setDocs(null);
  }, [spokes]);

  const search = useCallback(
    (query: string): SiteSearchResult[] => {
      if (!docs) return [];
      const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (terms.length === 0) return [];

      return docs
        .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
        .slice(0, MAX_RESULTS)
        .map(({ doc }) => ({
          title: doc.title,
          url: doc.url,
          spokeId: doc.spokeId,
          spokeLabel: doc.spokeLabel,
          snippet: buildSnippet(doc, terms),
        }));
    },
    [docs],
  );

  return { ready: docs !== null, loading, ensureLoaded, search };
}
