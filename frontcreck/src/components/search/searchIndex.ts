import { loadSearchModule } from '@/components/search/loadSearchModule';
import { loadCatalog } from '@/lib/data/client';
import type { SearchHit, SearchIndex } from '@/lib/search';
import type { Catalog } from '@/lib/types';

export interface LoadedSearch {
  catalog: Catalog;
  index: SearchIndex;
  search: (index: SearchIndex, query: string) => SearchHit[];
  /** The keystroke path: prefix matches only, well under a millisecond. */
  prefix: (index: SearchIndex, query: string) => SearchHit[];
  /** Typo matches (Fuse, tens of milliseconds): run off the keystroke path, after a pause. */
  fuzzy: (index: SearchIndex, query: string) => SearchHit[];
  fuzzyEligible: (query: string) => boolean;
}

let pending: Promise<LoadedSearch> | null = null;

/** Built on first focus of any search field: the search module (with Fuse) is a separate chunk. */
export function getSearch(): Promise<LoadedSearch> {
  if (!pending) {
    const p = Promise.all([loadSearchModule(), loadCatalog()]).then(([mod, catalog]) => {
      const loaded: LoadedSearch = {
        catalog,
        index: mod.buildSearchIndex(catalog.albums),
        search: mod.searchAlbums,
        prefix: mod.prefixSearch,
        fuzzy: mod.fuzzySearch,
        fuzzyEligible: mod.fuzzyEligible,
      };
      document.documentElement.dataset.searchIndex = 'ready';
      return loaded;
    });
    pending = p;
    p.catch(() => {
      if (pending === p) pending = null;
    });
  }
  return pending;
}

/** Tests only. */
export function resetSearchCache(): void {
  pending = null;
  delete document.documentElement.dataset.searchIndex;
}
