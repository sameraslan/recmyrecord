import type { RefObject } from 'react';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { listenLink, listenText } from '@/lib/data/catalog';
import type { SeedData, StopId } from '@/lib/types';
import { CopyLinkButton } from './CopyLinkButton';

const titleSize = (t: string) => (t.length > 22 ? 'len-l' : t.length > 12 ? 'len-m' : '');

export function SeedHeader({ seed, lit, titleRef, stop }: { seed: SeedData; lit: Set<string>; titleRef: RefObject<HTMLHeadingElement | null>; stop: StopId }) {
  // Spotify, or the album's first other service; with neither, no link (never a search link).
  const listen = listenLink(seed);
  return (
    <div className="seed">
      <Cover album={seed} size={116} eager />
      <p className="seed-artist">{seed.artist}</p>
      <h1 className={`seed-title ${titleSize(seed.title)}`.trim()} id="seed-title" tabIndex={-1} ref={titleRef}>
        {seed.title}
      </h1>
      <div className="seed-actions">
        {listen ? (
          <a className="btn btn-lamp" href={listen.url} target="_blank" rel="noopener noreferrer">
            {listenText(listen.service).open}
            <Icon name="ext" />
            <span className="sr-only">{COPY.album.newTab}</span>
          </a>
        ) : null}
        <CopyLinkButton slug={seed.slug} stop={stop} />
      </div>
      {seed.tags.length ? (
        <ul className="tags" aria-label={COPY.album.tagsLabel}>
          {seed.tags.map((t) => (
            <li key={t} className={lit.has(t) ? 'lit' : undefined}>
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
