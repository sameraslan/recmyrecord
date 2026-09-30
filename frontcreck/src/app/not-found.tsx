import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentTitle } from '@/components/DocumentTitle';
import { FocusOnMount } from '@/components/FocusOnMount';
import { SearchBox } from '@/components/search/SearchBox';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.notFound.title };

export default function NotFound() {
  return (
    <section className="notfound" aria-labelledby="nf-h">
      {/* Belt and braces: some Next versions ignore metadata on not-found; this keeps document.title right. */}
      <DocumentTitle title={COPY.titles.template.replace('%s', COPY.notFound.title)} />
      <h1 id="nf-h" tabIndex={-1}>
        {COPY.notFound.body}
      </h1>
      {/* The header field keeps the `/` shortcut, as on every page but Home. */}
      <SearchBox variant="page" />
      <Link className="textbtn u" href="/map">
        <span>{COPY.notFound.mapLink}</span>
      </Link>
      <FocusOnMount selector="#nf-h" />
    </section>
  );
}
