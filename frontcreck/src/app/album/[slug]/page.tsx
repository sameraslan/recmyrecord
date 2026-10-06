import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AlbumPanel } from '@/components/album/AlbumPanel';
import { AlbumView } from '@/components/album/AlbumView';
import { COPY } from '@/lib/copy';
import { ogCover } from '@/lib/data/catalog';
import { getAlbumPageData, getPrerenderSlugs } from '@/lib/data/server';

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getPrerenderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getAlbumPageData(slug);
  if (!data) return {};
  const title = COPY.titles.album(data.seed.title, data.seed.artist);
  const image = ogCover(data.seed.coverId);
  return {
    title,
    description: COPY.metaDescription,
    alternates: { canonical: `/album/${slug}` },
    openGraph: {
      title,
      description: COPY.metaDescription,
      siteName: COPY.wordmark,
      type: 'website',
      images: image ? [image] : [],
    },
  };
}

export default async function AlbumPage({ params }: Props) {
  const { slug } = await params;
  const data = getAlbumPageData(slug);
  if (!data) notFound();
  // The server HTML shows the balanced list; AlbumView reads ?by= on the client.
  return (
    <Suspense fallback={<AlbumPanel data={data} stop="balanced" />}>
      <AlbumView data={data} />
    </Suspense>
  );
}
