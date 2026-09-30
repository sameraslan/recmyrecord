import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Schibsted_Grotesk } from 'next/font/google';
import { MapStage } from '@/components/map/MapStage';
import { Header } from '@/components/shell/Header';
import { COPY } from '@/lib/copy';
import './globals.css';

const serif = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif-face',
  display: 'swap',
});
const sans = Schibsted_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans-face',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://recmyrecord.com'),
  title: { default: COPY.titles.home, template: `%s · ${COPY.wordmark}` },
  description: COPY.metaDescription,
  openGraph: { title: COPY.wordmark, description: COPY.metaDescription, siteName: COPY.wordmark, type: 'website' },
};

export const viewport: Viewport = {
  themeColor: '#15110d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a className="skip" href="#main">
          {COPY.skip}
        </a>
        <div className="grain" aria-hidden="true" />
        <Header />
        <main id="main" tabIndex={-1}>
          <div className="stage" id="stage">
            <MapStage />
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
