import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Schibsted_Grotesk, Tenor_Sans } from 'next/font/google';
import { MapStage } from '@/components/map/MapStage';
import { Header } from '@/components/shell/Header';
import { RouteTracker } from '@/components/shell/RouteTracker';
import { Toast } from '@/components/shell/Toast';
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
// The map's region names. Not preloaded: it is fetched when the names first render, after the map has loaded.
const names = Tenor_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-names-face',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://recmyrecord.com'),
  title: { default: COPY.titles.home, template: COPY.titles.template },
  description: COPY.metaDescription,
  openGraph: { title: COPY.wordmark, description: COPY.metaDescription, siteName: COPY.wordmark, type: 'website' },
};

export const viewport: Viewport = {
  themeColor: '#07060a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${names.variable}`}>
      <body>
        <a className="skip" href="#main">
          {COPY.skip}
        </a>
        <Header />
        <RouteTracker />
        <main id="main" tabIndex={-1}>
          <div className="stage" id="stage">
            <MapStage />
            {children}
          </div>
        </main>
        <Toast />
      </body>
    </html>
  );
}
