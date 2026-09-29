import { loadCatalog } from '@/lib/data/client';
import type { SearchHit, SearchIndex } from '@/lib/search';
import type { Catalog } from '@/lib/types';

export interface LoadedSearch {
  catalog: Catalog;
  index: SearchIndex;
  search: (index: SearchIndex, query: string) => SearchHit[];
}

let pending: Promise<LoadedSearch> | null = null;

/** Built on first focus of any search field: the search module (with Fuse) is a separate chunk. */
export function getSearch(): Promise<LoadedSearch> {
  if (!pending) {
    const p = Promise.all([import('@/lib/search'), loadCatalog()]).then(([mod, catalog]) => {
      const loaded = { catalog, index: mod.buildSearchIndex(catalog.albums), search: mod.searchAlbums };
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
