import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AlbumPanel } from '@/components/album/AlbumPanel';
import { AlbumView } from '@/components/album/AlbumView';
import { COPY } from '@/lib/copy';
import { coverUrl } from '@/lib/data/catalog';
import { getAlbumPageData, getAllSlugs } from '@/lib/data/server';

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getAllSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getAlbumPageData(slug);
  if (!data) return {};
  const title = COPY.titles.album(data.seed.title, data.seed.artist);
  const image = coverUrl(data.seed.coverId, 320);
  return {
    title,
    description: COPY.metaDescription,
    alternates: { canonical: `/album/${slug}` },
    openGraph: {
      title,
      description: COPY.metaDescription,
      siteName: COPY.wordmark,
      type: 'website',
      images: image ? [{ url: image, width: 640, height: 640 }] : [],
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
