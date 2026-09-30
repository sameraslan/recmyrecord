import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Playwright's dev mode (E2E_DEV=1) opens 127.0.0.1; without this, next dev blocks its scripts and pages never hydrate.
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      { source: '/recommend', destination: '/', permanent: true },
      { source: '/recommend/album', destination: '/', permanent: true },
      { source: '/recommend/album/:path*', destination: '/', permanent: true },
      { source: '/insights', destination: '/', permanent: true },
      { source: '/insights/:path*', destination: '/', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
